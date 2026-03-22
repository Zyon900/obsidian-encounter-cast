import { Notice, Plugin, TFile, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";
import {
	addCombatantsToSession,
	advanceCombatTurn,
	createCombatSession,
	moveCombatant,
	rollMonsterInitiative,
	setActiveToTopCombatant,
	setActiveCombatant,
	setCombatantAc,
	setCombatantDexMod,
	setCombatantHp,
	setCombatantHpMax,
	setCombatantTempHp,
	type CombatSession,
} from "./encounter/combat-session";
import { CodeblockRenderChild } from "./encounter/codeblock-render-child";
import { createCodeblockEditorKeymap } from "./encounter/codeblock-editor-keymap";
import type { EncounterPartySettings } from "./encounter/codeblock-difficulty";
import { parseEncounterBlock, summarizeEncounterSource } from "./encounter/codeblock-parser";
import { resolveEncounterEntries, type ResolveEncounterResult, type ResolvedEncounterEntry } from "./encounter/codeblock-resolver";
import { CodeblockSuggest } from "./encounter/codeblock-suggest";
import type { MonsterRecord } from "./monsters/types";
import { MonsterManager } from "./monsters/monster-manager";
import { CombatServer } from "./network/combat-server";
import type { PlayerTheme } from "./network/player-events";
import type { CodeblockRow } from "./ui/encounter/codeblock-widget";
import { PartySettingsModal } from "./ui/encounter/party-settings-modal";
import { pickMonsterNameOrCustom, pickMonsterOrCustom } from "./ui/dashboard/add-monster-picker";
import { DashboardItemView, DASHBOARD_VIEW_TYPE } from "./ui/dashboard/dashboard-item-view";
import type { DashboardViewModel } from "./ui/dashboard/types";
import { PreactMount } from "./ui/preact-mount";
import { CleanupRegistry } from "./utils/cleanup-registry";

type EncounterCastSettings = EncounterPartySettings;

const DEFAULT_SETTINGS: EncounterCastSettings = {
	partyMembers: null,
	partyLevel: null,
};

export default class EncounterCastPlugin extends Plugin {
	private readonly cleanupRegistry = new CleanupRegistry();
	private readonly encounterServer = new CombatServer();
	private readonly monsterManager = new MonsterManager(this.app);
	private preactMount: PreactMount | null = null;
	private statusBarRoot: HTMLElement | null = null;
	private currentSession: CombatSession | null = null;
	private encounterRunning = false;
	private sourceWriteQueue = Promise.resolve();
	private settings: EncounterCastSettings = { ...DEFAULT_SETTINGS };
	private readonly encounterWidgetComponents = new Set<CodeblockRenderChild>();

	async onload(): Promise<void> {
		const loadedSettings: unknown = await this.loadData();
		this.settings = mergeSettings(loadedSettings);
		this.statusBarRoot = this.addStatusBarItem();
		this.statusBarRoot.addClass("encounter-cast-status-root");
		this.preactMount = new PreactMount(this.statusBarRoot);

		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) =>
				new DashboardItemView(leaf, {
					onStartEncounter: () => {
						this.startEncounterFromDashboard();
					},
					onStopEncounter: () => {
						this.stopEncounterFromDashboard();
					},
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
					onAddMonster: () => {
						this.openAddMonsterModal();
					},
					onClearMonsters: () => {
						this.clearMonstersFromSession();
					},
					onActivateCombatant: (combatantId) => {
						this.activateCombatant(combatantId);
					},
					onMoveCombatant: (combatantId, direction) => {
						this.reorderCombatant(combatantId, direction);
					},
					onMoveCombatantToIndex: (combatantId, targetIndex) => {
						this.reorderCombatantToIndex(combatantId, targetIndex);
					},
					onSetHp: (combatantId, value) => {
						this.updateCombatantHp(combatantId, value);
					},
					onSetHpMax: (combatantId, value) => {
						this.updateCombatantHpMax(combatantId, value);
					},
					onSetTempHp: (combatantId, value) => {
						this.updateCombatantTempHp(combatantId, value);
					},
					onSetAc: (combatantId, value) => {
						this.updateCombatantAc(combatantId, value);
					},
					onSetDexMod: (combatantId, value) => {
						this.updateCombatantDexMod(combatantId, value);
					},
					onOpenMonster: (monster) => {
						void this.openMonsterInfo(monster);
					},
					onHoverMonster: (monster, anchorEl) => {
						void this.openMonsterHoverInfo(monster, anchorEl);
					},
					onMonsterHoverLeave: () => {
						this.closeMonsterHoverInfo();
					},
				}),
		);

		await this.monsterManager.initialize();
		this.encounterServer.setOnSessionChange((session) => {
			this.currentSession = session;
			if (!session) {
				this.encounterRunning = false;
			}
			this.renderFoundationView();
			this.renderDashboardView();
		});
		this.encounterServer.setEncounterRunning(this.encounterRunning);
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
			name: "Open dashboard",
			callback: async () => {
				await this.openDashboardView();
			},
		});
		this.addCommand({
			id: "open-encounter-party-settings",
			name: "Open encounter party settings",
			callback: () => {
				this.openPartySettingsModal();
			},
		});

		this.registerMarkdownCodeBlockProcessor("encounter", (source, el, ctx) => {
			el.empty();
			const initialSectionInfo = ctx.getSectionInfo(el);
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
						xp: null,
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
					xp: resolved.monster.xp,
					monster: resolved.monster,
				};
			});
			const widgetRoot = el.createDiv();
			let component: CodeblockRenderChild;
			component = new CodeblockRenderChild(widgetRoot, {
				title: summary.title,
				rows,
				partySettings: {
					partyMembers: this.settings.partyMembers,
					partyLevel: this.settings.partyLevel,
				},
				onInfo: (monster) => {
					void this.openMonsterInfo(monster);
				},
				onHoverInfo: (monster, anchorEl) => {
					void this.openMonsterHoverInfo(monster, anchorEl);
				},
				onHoverLeave: () => {
					this.closeMonsterHoverInfo();
				},
				onRowsChange: (nextRows, nextTitle) => {
					void this.persistEncounterRows(ctx, el, nextTitle, nextRows, initialSectionInfo);
				},
				onTitleChange: (nextRows, nextTitle) => {
					void this.persistEncounterRows(ctx, el, nextTitle, nextRows, initialSectionInfo);
				},
				onRunEncounter: (nextRows, nextTitle) => {
					void this.handleEncounterAction(this.serializeEncounterBody(nextTitle, nextRows), "run");
				},
				onAddToEncounter: (nextRows, nextTitle) => {
					void this.handleEncounterAction(this.serializeEncounterBody(nextTitle, nextRows), "add");
				},
				onSelectMonsterForCodeblock: async () => pickMonsterNameOrCustom(this.app, this.monsterManager),
				onDispose: () => {
					this.encounterWidgetComponents.delete(component);
				},
			});
			this.encounterWidgetComponents.add(component);
			ctx.addChild(component);
		});

		this.registerEditorSuggest(new CodeblockSuggest(this.app, this.monsterManager));
		this.registerEditorExtension(createCodeblockEditorKeymap());

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
		this.encounterWidgetComponents.clear();
		this.monsterManager.hideCreatureHoverPreview();
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
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof DashboardItemView) {
				view.update(model);
			}
		}
	}

	private buildDashboardViewModel(): DashboardViewModel {
		const serverState = this.encounterServer.getState();
		return {
			session: this.currentSession,
			encounterRunning: this.encounterRunning,
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
			const players = this.preparePlayerCombatantsForCombatStart(this.getPlayerCombatants());
			const baseSession: CombatSession = this.currentSession
				? {
						...this.currentSession,
						title: prepared.parseResult.title,
						round: 1,
						activeIndex: 0,
						combatants: players,
						updatedAt: new Date().toISOString(),
					}
				: createCombatSession(prepared.parseResult.title, []);
			const nextSession = addCombatantsToSession(baseSession, prepared.parseResult.title, prepared.resolvedResult.resolved, {
				rollInitiative: true,
				insertByInitiative: true,
			});
			this.encounterRunning = true;
			this.updateSession(setActiveToTopCombatant(nextSession));
			this.renderDashboardView();
			await this.openDashboardView();
			new Notice(`Encounter started. ${totalCreatures} monsters loaded.`);
			return;
		}

		const nextSession = this.currentSession
			? addCombatantsToSession(this.currentSession, prepared.parseResult.title, prepared.resolvedResult.resolved, {
					rollInitiative: this.encounterRunning,
					insertByInitiative: this.encounterRunning,
				})
			: createCombatSession(prepared.parseResult.title, prepared.resolvedResult.resolved);
		this.updateSession(nextSession);
		this.renderDashboardView();
		await this.openDashboardView();
		new Notice(`Encounter updated. ${totalCreatures} monsters added.`);
	}

	private async persistEncounterRows(
		ctx: MarkdownPostProcessorContext,
		sectionEl: HTMLElement,
		title: string | null,
		rows: CodeblockRow[],
		sectionInfoHint?: MarkdownSectionInformation | null,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) {
			return;
		}

		const sectionInfo = ctx.getSectionInfo(sectionEl) ?? sectionInfoHint ?? null;
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

	private serializeEncounterBody(title: string | null, rows: CodeblockRow[]): string {
		const lines: string[] = [];
		if (title && title.trim().length > 0) {
			lines.push(title.trim());
		}

		for (const row of rows) {
			const sanitizedName = row.customName?.replace(/'/g, "").trim() ?? "";
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
		const bodyLines = encounterBody.length ? encounterBody.split("\n") : [];
		const fenceLocation = this.findEncounterFenceRange(lines, sectionInfo);
		if (!fenceLocation) {
			return documentText;
		}

		lines.splice(fenceLocation.opening + 1, fenceLocation.closing - fenceLocation.opening - 1, ...bodyLines);
		return lines.join(newline);
	}

	private findEncounterFenceRange(
		lines: string[],
		sectionInfo: MarkdownSectionInformation,
	): { opening: number; closing: number } | null {
		const safeStart = Math.max(0, sectionInfo.lineStart);
		const safeEnd = Math.min(lines.length - 1, Math.max(safeStart, sectionInfo.lineEnd));

		for (let index = safeStart; index >= 0; index--) {
			const line = lines[index]?.trim() ?? "";
			if (!line.startsWith("```")) {
				continue;
			}

			if (!/^```encounter(?:\s|$)/i.test(line)) {
				continue;
			}

			for (let closeIndex = Math.max(index + 1, safeEnd); closeIndex < lines.length; closeIndex++) {
				const closingLine = lines[closeIndex]?.trim() ?? "";
				if (closingLine === "```") {
					return { opening: index, closing: closeIndex };
				}
			}

			return null;
		}

		for (let index = 0; index < lines.length; index++) {
			const line = lines[index]?.trim() ?? "";
			if (!/^```encounter(?:\s|$)/i.test(line)) {
				continue;
			}

			for (let closeIndex = index + 1; closeIndex < lines.length; closeIndex++) {
				const closingLine = lines[closeIndex]?.trim() ?? "";
				if (closingLine === "```") {
					return { opening: index, closing: closeIndex };
				}
			}
			return null;
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
			const fallbackEntries = resolvedResult.unresolved.map((entry) => ({
				entry,
				monster: this.createUnresolvedMonsterRecord(entry.monsterQuery),
			}));
			for (const unresolved of resolvedResult.unresolved.slice(0, 4)) {
				new Notice(`Line ${unresolved.line}: Added unresolved "${unresolved.monsterQuery}" with empty stats.`);
			}
			if (resolvedResult.unresolved.length > 4) {
				new Notice(`${resolvedResult.unresolved.length - 4} more unresolved encounter rows added with empty stats.`);
			}
			return {
				parseResult,
				resolvedResult: {
					resolved: resolvedResult.resolved.concat(fallbackEntries),
					unresolved: [],
				},
			};
		}

		return { parseResult, resolvedResult };
	}

	private createUnresolvedMonsterRecord(name: string): MonsterRecord {
		const safeName = name.trim() || "Unknown creature";
		const slug = safeName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");

		return {
			id: `unresolved::${slug || "unknown"}`,
			name: safeName,
			challenge: null,
			xp: null,
			hp: null,
			max_hp: null,
			ac: null,
			dex_mod: null,
			damage_vulnerabilities: [],
			damage_resistances: [],
			damage_immunities: [],
			condition_immunities: [],
			source: null,
			slug: slug || "unknown",
		};
	}

	private updateSession(session: CombatSession | null): void {
		this.currentSession = session;
		if (!session) {
			this.encounterRunning = false;
		}
		this.encounterServer.setEncounterRunning(this.encounterRunning);
		this.encounterServer.setSession(session);
		this.renderFoundationView();
		this.renderDashboardView();
	}

	private getPlayerCombatants(): CombatSession["combatants"] {
		if (!this.currentSession) {
			return [];
		}

		return this.currentSession.combatants.filter((combatant) => combatant.isPlayer === true);
	}

	private preparePlayerCombatantsForCombatStart(combatants: CombatSession["combatants"]): CombatSession["combatants"] {
		return combatants.map((combatant) => ({
			...combatant,
			initiative: null,
			initiativeRoll: null,
			initiativeCriticalFailure: false,
		}));
	}

	private clearPlayerInitiatives(session: CombatSession): CombatSession {
		return {
			...session,
			combatants: session.combatants.map((combatant) =>
				combatant.isPlayer === true
					? {
							...combatant,
							initiative: null,
							initiativeRoll: null,
							initiativeCriticalFailure: false,
						}
					: combatant,
			),
			updatedAt: new Date().toISOString(),
		};
	}

	private startEncounterFromDashboard(): void {
		if (!this.currentSession) {
			new Notice("No encounter available to run.");
			return;
		}

		const withClearedPlayerInitiative = this.clearPlayerInitiatives(this.currentSession);
		this.currentSession = setActiveToTopCombatant(rollMonsterInitiative(withClearedPlayerInitiative));
		this.encounterRunning = true;
		this.updateSession(this.currentSession);
		new Notice("Encounter running.");
	}

	private stopEncounterFromDashboard(): void {
		if (!this.currentSession || !this.encounterRunning) {
			return;
		}

		this.encounterRunning = false;
		this.updateSession({
			...this.currentSession,
			round: 1,
			updatedAt: new Date().toISOString(),
		});
		new Notice("Encounter stopped.");
	}

	private openAddMonsterModal(): void {
		void pickMonsterOrCustom(this.app, this.monsterManager).then((selection) => {
			if (!selection) {
				return;
			}

			this.addMonsterToSession(selection.monster ?? this.createUnresolvedMonsterRecord(selection.monsterName));
		});
	}

	private addMonsterToSession(monster: MonsterRecord): void {
		const session = this.currentSession ?? createCombatSession("Current encounter", []);
		const resolved: ResolvedEncounterEntry = {
			entry: {
				line: session.combatants.length + 1,
				quantity: 1,
				monsterQuery: monster.name,
				customName: null,
			},
			monster,
		};

		const nextSession = addCombatantsToSession(session, session.title, [resolved], {
			rollInitiative: this.encounterRunning,
			insertByInitiative: this.encounterRunning,
		});
		this.updateSession(nextSession);
		new Notice(`${monster.name} added to encounter.`);
	}

	private clearMonstersFromSession(): void {
		if (!this.currentSession) {
			return;
		}

		const monsterCount = this.currentSession.combatants.filter((combatant) => combatant.isPlayer !== true).length;
		if (monsterCount === 0) {
			new Notice("No monsters to clear.");
			return;
		}

		const playerCombatants = this.getPlayerCombatants();
		const activeId = this.currentSession.combatants[this.currentSession.activeIndex]?.id ?? null;
		const activeIndex = activeId ? playerCombatants.findIndex((combatant) => combatant.id === activeId) : -1;

		if (this.encounterRunning && playerCombatants.length === 0) {
			this.encounterRunning = false;
		}

		this.updateSession({
			...this.currentSession,
			combatants: playerCombatants,
			activeIndex: activeIndex >= 0 ? activeIndex : 0,
			round: playerCombatants.length > 0 ? this.currentSession.round : 1,
			updatedAt: new Date().toISOString(),
		});
		new Notice(monsterCount === 1 ? "1 monster removed." : `${monsterCount} monsters removed.`);
	}
	private advanceTurn(): void {
		if (!this.currentSession || !this.encounterRunning) {
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
		this.reorderCombatantToIndex(combatantId, targetIndex);
	}

	private reorderCombatantToIndex(combatantId: string, targetIndex: number): void {
		if (!this.currentSession) {
			return;
		}
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

	private updateCombatantHpMax(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = this.parseNumberInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantHpMax(this.currentSession, combatantId, parsed));
	}

	private updateCombatantTempHp(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = this.parseNumberInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantTempHp(this.currentSession, combatantId, parsed ?? 0));
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

	private updateCombatantDexMod(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = this.parseNumberInput(value);
		if (parsed === undefined) {
			return;
		}

		this.updateSession(setCombatantDexMod(this.currentSession, combatantId, parsed));
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
		let leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(false);
			await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		}

		await this.app.workspace.revealLeaf(leaf);
		this.renderDashboardView();
	}

	private async startEncounterServer(): Promise<void> {
		try {
			const state = await this.encounterServer.start();
			this.encounterServer.setTheme(this.captureTheme());
			this.encounterServer.setSupportUrl(this.resolveSupportUrlFromManifest());
			this.encounterServer.setEncounterRunning(this.encounterRunning);
			this.encounterServer.setSession(this.currentSession);
			this.renderFoundationView();
			this.renderDashboardView();
			const invite = state.inviteUrls[0];
			const summary = invite
				? `Encounter server started on port ${state.port ?? "?"}. ${invite}`
				: `Encounter server started on port ${state.port ?? "?"}.`;
			new Notice(summary);
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

	private async updatePartySettings(settings: EncounterPartySettings): Promise<void> {
		this.settings = {
			partyMembers: settings.partyMembers,
			partyLevel: settings.partyLevel,
		};
		await this.saveData(this.settings);
		this.refreshEncounterDifficultyViews();
	}

	private openPartySettingsModal(): void {
		const modal = new PartySettingsModal(
			this.app,
			{ partyMembers: this.settings.partyMembers, partyLevel: this.settings.partyLevel },
			async (settings) => {
				await this.updatePartySettings(settings);
				new Notice("Encounter settings saved.");
			},
		);
		modal.open();
	}

	private refreshEncounterDifficultyViews(): void {
		const partySettings: EncounterPartySettings = {
			partyMembers: this.settings.partyMembers,
			partyLevel: this.settings.partyLevel,
		};
		for (const component of this.encounterWidgetComponents) {
			component.updatePartySettings(partySettings);
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

	private async openMonsterHoverInfo(monster: MonsterRecord, anchorEl: HTMLElement): Promise<void> {
		try {
			await this.monsterManager.showCreatureHoverPreview(monster, anchorEl);
		} catch {
			// Intentionally ignore hover preview failures to avoid noisy notices while mousing around.
		}
	}

	private closeMonsterHoverInfo(): void {
		this.monsterManager.scheduleHideCreatureHoverPreview(500);
	}

	private captureTheme(): PlayerTheme | null {
		if (typeof document === "undefined") {
			return null;
		}

		const rootStyles = window.getComputedStyle(document.documentElement);
		const bodyStyles = document.body ? window.getComputedStyle(document.body) : null;
		const read = (name: string, fallback: string) => {
			const bodyValue = bodyStyles?.getPropertyValue(name).trim() ?? "";
			if (bodyValue.length) {
				return bodyValue;
			}
			const rootValue = rootStyles.getPropertyValue(name).trim();
			return rootValue.length ? rootValue : fallback;
		};

		return {
			backgroundPrimary: read("--background-primary", "#1f1f1f"),
			backgroundSecondary: read("--background-secondary", "#2a2a2a"),
			textNormal: read("--text-normal", "#e8e8e8"),
			textMuted: read("--text-muted", "#aaaaaa"),
			textError: read("--text-error", "#e05a5a"),
			interactiveAccent: read("--interactive-accent", "#5ea6ff"),
			textOnAccent: read("--text-on-accent", "#ffffff"),
			border: read("--background-modifier-border", "#3a3a3a"),
		};
	}

	private resolveSupportUrlFromManifest(): string | null {
		const candidateFunding = (this.manifest as { fundingUrl?: unknown }).fundingUrl;
		if (typeof candidateFunding === "string" && candidateFunding.trim().length > 0) {
			return candidateFunding.trim();
		}
		if (candidateFunding && typeof candidateFunding === "object") {
			const values = Object.values(candidateFunding as Record<string, unknown>);
			for (const value of values) {
				if (typeof value === "string" && value.trim().length > 0) {
					return value.trim();
				}
			}
		}

		const candidateAuthorUrl = (this.manifest as { authorUrl?: unknown }).authorUrl;
		if (typeof candidateAuthorUrl === "string" && candidateAuthorUrl.trim().length > 0) {
			return candidateAuthorUrl.trim();
		}

		return null;
	}
}

function mergeSettings(value: unknown): EncounterCastSettings {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_SETTINGS };
	}

	const candidate = value as Partial<EncounterPartySettings>;
	return {
		partyMembers: Number.isInteger(candidate.partyMembers) ? candidate.partyMembers ?? null : null,
		partyLevel: Number.isInteger(candidate.partyLevel) ? candidate.partyLevel ?? null : null,
	};
}
