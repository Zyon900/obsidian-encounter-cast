import { Notice, Plugin, TFile, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";
import {
	addCombatantsToSession,
	advanceCombatTurn,
	createCombatSession,
	moveCombatant,
	setActiveCombatant,
	setCombatantAc,
	setCombatantHp,
	type CombatSession,
} from "./encounter/combat-session";
import { EncounterBlockWidgetComponent } from "./encounter/encounter-block-widget-component";
import { createEncounterEditorKeymap } from "./encounter/encounter-editor-keymap";
import { parseEncounterBlock, summarizeEncounterSource } from "./encounter/encounter-parser";
import { resolveEncounterEntries, type ResolveEncounterResult } from "./encounter/encounter-resolver";
import { EncounterSuggest } from "./encounter/encounter-suggest";
import type { MonsterRecord } from "./monsters/types";
import { FantasyStatblocksAdapter } from "./monsters/fantasy-statblocks-adapter";
import { MonsterManager } from "./monsters/monster-manager";
import { EncounterServer } from "./network/encounter-server";
import type { EncounterPreviewRow } from "./ui/encounter/encounter-block-widget";
import { DmDashboardView, DM_DASHBOARD_VIEW_TYPE } from "./ui/dashboard/dm-dashboard-view";
import type { DashboardViewModel } from "./ui/dashboard/types";
import { PreactMount } from "./ui/preact-mount";
import { CleanupRegistry } from "./utils/cleanup-registry";

export default class EncounterCastPlugin extends Plugin {
	private readonly cleanupRegistry = new CleanupRegistry();
	private readonly encounterServer = new EncounterServer();
	private readonly monsterManager = new MonsterManager(new FantasyStatblocksAdapter(this.app));
	private preactMount: PreactMount | null = null;
	private statusBarRoot: HTMLElement | null = null;
	private currentSession: CombatSession | null = null;
	private sourceWriteQueue = Promise.resolve();

	async onload(): Promise<void> {
		this.statusBarRoot = this.addStatusBarItem();
		this.statusBarRoot.addClass("encounter-cast-status-root");
		this.preactMount = new PreactMount(this.statusBarRoot);

		this.registerView(
			DM_DASHBOARD_VIEW_TYPE,
			(leaf) =>
				new DmDashboardView(leaf, {
					onStartServer: () => {
						void this.startEncounterServer();
					},
					onStopServer: () => {
						void this.stopEncounterServer();
					},
					onCopyInvite: (url) => {
						void this.copyInviteLink(url);
					},
					onNextTurn: () => {
						this.advanceTurn();
					},
					onActivateCombatant: (combatantId) => {
						this.activateCombatant(combatantId);
					},
					onMoveCombatant: (combatantId, direction) => {
						this.reorderCombatant(combatantId, direction);
					},
					onSetHp: (combatantId, value) => {
						this.updateCombatantHp(combatantId, value);
					},
					onSetAc: (combatantId, value) => {
						this.updateCombatantAc(combatantId, value);
					},
					onOpenMonster: (monster) => {
						void this.openMonsterInfo(monster);
					},
				}),
		);

		await this.monsterManager.initialize();
		this.renderFoundationView();
		this.renderDashboardView();
		this.maybeNotifyMonsterState();

		this.addCommand({
			id: "refresh-monster-cache",
			name: "Refresh monster cache",
			callback: async () => {
				const refreshed = this.monsterManager.refreshCache();
				this.renderFoundationView();
				this.maybeNotifyMonsterState(refreshed ? "Monster cache refreshed." : undefined);
			},
		});
		this.addCommand({
			id: "open-dm-dashboard",
			name: "Open DM dashboard",
			callback: async () => {
				await this.openDashboardView();
			},
		});

		this.registerMarkdownCodeBlockProcessor("encounter", (source, el, ctx) => {
			el.empty();
			const summary = summarizeEncounterSource(source);
			const parseResult = parseEncounterBlock(source);
			const resolvedResult = resolveEncounterEntries(parseResult.entries, this.monsterManager);
			const resolvedByLine = new Map(resolvedResult.resolved.map((item) => [item.entry.line, item]));
			const rows = parseResult.entries.map((entry) => {
				const resolved = resolvedByLine.get(entry.line);
				if (!resolved) {
					return {
						id: `unresolved-${entry.line}-${entry.monsterQuery}`,
						quantity: entry.quantity,
						customName: entry.customName,
						monsterQuery: entry.monsterQuery,
						monsterName: entry.monsterQuery,
						resolved: false,
						challenge: null,
						monster: null,
					};
				}

				return {
					id: `resolved-${entry.line}-${resolved.monster.id}`,
					quantity: entry.quantity,
					customName: entry.customName,
					monsterQuery: entry.monsterQuery,
					monsterName: resolved.monster.name,
					resolved: true,
					challenge: resolved.monster.challenge,
					monster: resolved.monster,
				};
			});
			const widgetRoot = el.createDiv();
			const component = new EncounterBlockWidgetComponent(widgetRoot, {
				title: summary.title,
				rows,
				onInfo: (monster) => {
					void this.openMonsterInfo(monster);
				},
				onRowsChange: (nextRows) => {
					void this.persistEncounterRows(ctx, el, summary.title, nextRows);
				},
				onRunEncounter: (nextRows) => {
					void this.handleEncounterAction(this.serializeEncounterBody(summary.title, nextRows), "run");
				},
				onAddToEncounter: (nextRows) => {
					void this.handleEncounterAction(this.serializeEncounterBody(summary.title, nextRows), "add");
				},
			});
			ctx.addChild(component);
		});

		this.registerEditorSuggest(new EncounterSuggest(this.app, this.monsterManager));
		this.registerEditorExtension(createEncounterEditorKeymap());

		const refreshOnResize = () => {
			this.cleanupRegistry.debounce("status-refresh", 120, () => this.renderFoundationView());
		};
		window.addEventListener("resize", refreshOnResize);
		this.cleanupRegistry.add(() => {
			window.removeEventListener("resize", refreshOnResize);
		});
	}

	onunload(): void {
		void this.encounterServer.stop();
		this.app.workspace.detachLeavesOfType(DM_DASHBOARD_VIEW_TYPE);
		this.preactMount?.unmount();
		this.preactMount = null;
		this.statusBarRoot = null;
		this.cleanupRegistry.dispose();
	}

	private renderFoundationView(): void {
		const state = this.encounterServer.getState();
		const monsterState = this.monsterManager.getState();
		this.preactMount?.update({
			serverRunning: state.running,
			serverPort: state.port,
			monsterReady: monsterState.ready,
			monsterCount: monsterState.cachedCount,
			monsterError: monsterState.error,
		});
	}

	private renderDashboardView(): void {
		const model = this.buildDashboardViewModel();
		for (const leaf of this.app.workspace.getLeavesOfType(DM_DASHBOARD_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof DmDashboardView) {
				view.update(model);
			}
		}
	}

	private buildDashboardViewModel(): DashboardViewModel {
		const serverState = this.encounterServer.getState();
		return {
			session: this.currentSession,
			serverRunning: serverState.running,
			serverPort: serverState.port,
			roomToken: serverState.roomToken,
			inviteUrls: serverState.inviteUrls,
		};
	}

	private maybeNotifyMonsterState(message?: string): void {
		const state = this.monsterManager.getState();
		if (message) {
			new Notice(message);
			return;
		}

		if (state.error) {
			new Notice(state.error);
		}
	}

	private async handleEncounterAction(source: string, mode: "run" | "add"): Promise<void> {
		const prepared = this.prepareEncounter(source);
		if (!prepared) {
			return;
		}

		const totalCreatures = prepared.resolvedResult.resolved.reduce((sum, item) => sum + item.entry.quantity, 0);
		if (mode === "run") {
			this.updateSession(createCombatSession(prepared.parseResult.title, prepared.resolvedResult.resolved));
			await this.openDashboardView();
			new Notice(`Encounter started. ${totalCreatures} creatures added to the dashboard.`);
			return;
		}

		const nextSession = this.currentSession
			? addCombatantsToSession(this.currentSession, prepared.parseResult.title, prepared.resolvedResult.resolved)
			: createCombatSession(prepared.parseResult.title, prepared.resolvedResult.resolved);
		this.updateSession(nextSession);
		await this.openDashboardView();
		new Notice(`Encounter updated. ${totalCreatures} creatures added to active combat.`);
	}

	private async persistEncounterRows(
		ctx: MarkdownPostProcessorContext,
		sectionEl: HTMLElement,
		title: string | null,
		rows: EncounterPreviewRow[],
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const sectionInfo = ctx.getSectionInfo(sectionEl);
		if (!sectionInfo) {
			return;
		}

		const updatedBody = this.serializeEncounterBody(title, rows);
		const queueTask = async () => {
			try {
				await this.app.vault.process(file, (current) => this.replaceEncounterSection(current, sectionInfo, updatedBody));
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to update encounter block.";
				new Notice(message);
			}
		};

		this.sourceWriteQueue = this.sourceWriteQueue.then(queueTask, queueTask);
		await this.sourceWriteQueue;
	}

	private serializeEncounterBody(title: string | null, rows: EncounterPreviewRow[]): string {
		const lines: string[] = [];
		if (title && title.trim().length > 0) {
			lines.push(title.trim());
		}

		for (const row of rows) {
			const sanitizedName = row.customName?.replaceAll("'", "").trim() ?? "";
			const customNamePart = sanitizedName ? ` '${sanitizedName}'` : "";
			lines.push(`${row.quantity}x ${row.monsterQuery}${customNamePart}`);
		}

		return lines.join("\n");
	}

	private replaceEncounterSection(
		documentText: string,
		sectionInfo: MarkdownSectionInformation,
		encounterBody: string,
	): string {
		const newline = documentText.includes("\r\n") ? "\r\n" : "\n";
		const lines = documentText.split(/\r?\n/);
		const sectionLines = sectionInfo.text.split(/\r?\n/);
		const openingFence = sectionLines[0] ?? "```encounter";
		const closingFence = sectionLines[sectionLines.length - 1] ?? "```";
		const updatedSection = [openingFence, ...encounterBody.split("\n"), closingFence].join("\n");
		const normalizedSection = sectionInfo.text.replace(/\r?\n/g, "\n");

		let start = Math.max(0, sectionInfo.lineStart);
		let end = Math.min(lines.length, sectionInfo.lineEnd + 1);
		if (!this.matchesSection(lines, start, end, normalizedSection)) {
			end = Math.min(lines.length, sectionInfo.lineEnd);
			if (!this.matchesSection(lines, start, end, normalizedSection)) {
				const location = this.findSectionLocation(lines, normalizedSection);
				if (!location) {
					return documentText;
				}
				start = location.start;
				end = location.end;
			}
		}

		const replacementLines = updatedSection.split("\n");
		lines.splice(start, end - start, ...replacementLines);
		return lines.join(newline);
	}

	private matchesSection(lines: string[], start: number, end: number, normalizedSection: string): boolean {
		if (end < start) {
			return false;
		}

		return lines.slice(start, end).join("\n") === normalizedSection;
	}

	private findSectionLocation(lines: string[], normalizedSection: string): { start: number; end: number } | null {
		const target = normalizedSection.split("\n");
		if (!target.length) {
			return null;
		}

		for (let start = 0; start <= lines.length - target.length; start++) {
			const candidate = lines.slice(start, start + target.length);
			if (candidate.join("\n") === normalizedSection) {
				return { start, end: start + target.length };
			}
		}

		return null;
	}

	private prepareEncounter(
		source: string,
	): { parseResult: ReturnType<typeof parseEncounterBlock>; resolvedResult: ResolveEncounterResult } | null {
		const parseResult = parseEncounterBlock(source);
		if (parseResult.errors.length > 0) {
			for (const error of parseResult.errors.slice(0, 4)) {
				new Notice(`Line ${error.line}: ${error.message}`);
			}
			if (parseResult.errors.length > 4) {
				new Notice(`${parseResult.errors.length - 4} more encounter parsing errors.`);
			}
			return null;
		}

		const resolvedResult = resolveEncounterEntries(parseResult.entries, this.monsterManager);
		if (resolvedResult.unresolved.length > 0) {
			for (const unresolved of resolvedResult.unresolved.slice(0, 4)) {
				new Notice(`Line ${unresolved.line}: Could not resolve "${unresolved.monsterQuery}".`);
			}
			if (resolvedResult.unresolved.length > 4) {
				new Notice(`${resolvedResult.unresolved.length - 4} more unresolved encounter rows.`);
			}
			return null;
		}

		return { parseResult, resolvedResult };
	}

	private updateSession(session: CombatSession | null): void {
		this.currentSession = session;
		this.encounterServer.setSession(session);
		this.renderFoundationView();
		this.renderDashboardView();
	}

	private advanceTurn(): void {
		if (!this.currentSession) {
			return;
		}
		this.updateSession(advanceCombatTurn(this.currentSession));
	}

	private activateCombatant(combatantId: string): void {
		if (!this.currentSession) {
			return;
		}
		this.updateSession(setActiveCombatant(this.currentSession, combatantId));
	}

	private reorderCombatant(combatantId: string, direction: "up" | "down"): void {
		if (!this.currentSession) {
			return;
		}

		const index = this.currentSession.combatants.findIndex((combatant) => combatant.id === combatantId);
		if (index === -1) {
			return;
		}

		const targetIndex = direction === "up" ? index - 1 : index + 1;
		this.updateSession(moveCombatant(this.currentSession, combatantId, targetIndex));
	}

	private updateCombatantHp(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = this.parseNumberInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantHp(this.currentSession, combatantId, parsed));
	}

	private updateCombatantAc(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = this.parseNumberInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantAc(this.currentSession, combatantId, parsed));
	}

	private parseNumberInput(value: string): number | null | undefined {
		const trimmed = value.trim();
		if (!trimmed.length) {
			return null;
		}

		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	private async openDashboardView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(DM_DASHBOARD_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
			await leaf.setViewState({ type: DM_DASHBOARD_VIEW_TYPE, active: true });
		}

		await this.app.workspace.revealLeaf(leaf);
		this.renderDashboardView();
	}

	private async startEncounterServer(): Promise<void> {
		try {
			const state = await this.encounterServer.start();
			this.encounterServer.setSession(this.currentSession);
			this.renderFoundationView();
			this.renderDashboardView();
			new Notice(`Encounter server started on port ${state.port ?? "?"}.`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to start encounter server.";
			new Notice(message);
		}
	}

	private async stopEncounterServer(): Promise<void> {
		try {
			await this.encounterServer.stop();
			this.renderFoundationView();
			this.renderDashboardView();
			new Notice("Encounter server stopped.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to stop encounter server.";
			new Notice(message);
		}
	}

	private async copyInviteLink(url: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(url);
			new Notice("Invite link copied.");
		} catch {
			new Notice("Failed to copy invite link.");
		}
	}

	private async openMonsterInfo(monster: MonsterRecord): Promise<void> {
		try {
			await this.monsterManager.openCreaturePreview(monster);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to open creature preview.";
			new Notice(message);
		}
	}
}
