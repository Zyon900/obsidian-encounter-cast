import { Notice, Plugin, TFile, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";
import { join } from "node:path";
import { DiceRollerAdapter } from "./dice/dice-roller-adapter";
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
import {
	replaceEncounterSection,
	serializeEncounterBody,
	tryPersistEncounterRowsInActiveEditor,
} from "./encounter/codeblock-persistence";
import { createUnresolvedMonsterRecord, prepareEncounterSource } from "./encounter/encounter-preparation";
import { resolveEncounterEntries, type ResolvedEncounterEntry } from "./encounter/codeblock-resolver";
import { clearPlayerInitiatives, getPlayerCombatants, preparePlayerCombatantsForCombatStart } from "./encounter/session-state";
import { CodeblockSuggest } from "./encounter/codeblock-suggest";
import type { MonsterRecord } from "./monsters/types";
import { MonsterManager } from "./monsters/monster-manager";
import { CombatServer } from "./network/combat-server";
import { captureObsidianTheme, resolveSupportUrlFromManifest } from "./network/player-theme";
import { applyCombatServerRuntimeState, buildEncounterServerStartSummary } from "./network/server-orchestration";
import { DEFAULT_SETTINGS, mergeSettings, normalizeHoverDelay, normalizeHoverWidth, type EncounterCastSettings } from "./settings/plugin-settings";
import type { CodeblockRow } from "./ui/encounter/codeblock-widget";
import { PartySettingsModal } from "./ui/encounter/party-settings-modal";
import { CombatantRenameModal } from "./ui/dashboard/combatant-rename-modal";
import { DamageHealModal } from "./ui/dashboard/damage-heal-modal";
import { InviteQrModal } from "./ui/dashboard/invite-qr-modal";
import { EncounterCastSettingTab } from "./ui/settings/plugin-settings-tab";
import { pickMonsterNameOrCustom, pickMonsterOrCustom } from "./ui/dashboard/add-monster-picker";
import { applyDamageHealToCombatants, removeCombatantFromSession } from "./ui/dashboard/combatant-actions";
import { clearMonstersFromSessionState, duplicateSelectedMonsters, parseIntegerInput } from "./ui/dashboard/dashboard-session-state";
import { DashboardItemView, DASHBOARD_VIEW_TYPE } from "./ui/dashboard/dashboard-item-view";
import { normalizeHotkey, type DashboardHotkeyAction } from "./ui/dashboard/hotkeys";
import type { DashboardViewModel } from "./ui/dashboard/types";
import { PreactMount } from "./ui/preact-mount";
import { CleanupRegistry } from "./utils/cleanup-registry";

export default class EncounterCastPlugin extends Plugin {
	private readonly cleanupRegistry = new CleanupRegistry();
	private readonly encounterServer = new CombatServer();
	private readonly diceRollerAdapter = new DiceRollerAdapter(this.app);
	private readonly monsterManager = new MonsterManager(this.app);
	private preactMount: PreactMount | null = null;
	private statusBarRoot: HTMLElement | null = null;
	private currentSession: CombatSession | null = null;
	private encounterRunning = false;
	private sourceWriteQueue = Promise.resolve();
	private settings: EncounterCastSettings = { ...DEFAULT_SETTINGS };
	private readonly encounterWidgetComponents = new Set<CodeblockRenderChild>();

	getSettingsSnapshot(): EncounterCastSettings {
		return { ...this.settings };
	}

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
					onShowInviteQr: (url) => {
						this.openInviteQrModal(url);
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
					onDamageHealCombatants: (combatantIds) => {
						this.openDamageHealPlaceholder(combatantIds);
					},
					onRenameCombatant: (combatantId) => {
						this.renameCombatant(combatantId);
					},
					onDeleteCombatants: (combatantIds) => {
						this.deleteCombatants(combatantIds);
					},
					onDuplicateCombatants: (combatantIds) => {
						this.duplicateCombatants(combatantIds);
					},
					onKickPlayers: (combatantIds) => {
						this.kickPlayers(combatantIds);
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
						void this.openMonsterInfo(monster, "dashboard");
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
		this.monsterManager.setHoverPreviewLayout(this.settings.hoverPreviewWidthPx, this.settings.hoverPreviewWideColumns);
		this.encounterServer.setAssetRootDir(this.resolvePluginAssetRootDir());
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
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Intentional acronym casing requested by plugin author.
		this.addRibbonIcon("swords", "Open DM dashboard", () => {
			void this.openDashboardView();
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
				hoverPreviewEnabled: this.settings.hoverPreviewEnabled,
				hoverPreviewDelayMs: this.settings.hoverPreviewDelayMs,
				onInfo: (monster) => {
					void this.openMonsterInfo(monster, "codeblock");
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
					void this.handleEncounterAction(serializeEncounterBody(nextTitle, nextRows), "run");
				},
				onAddToEncounter: (nextRows, nextTitle) => {
					void this.handleEncounterAction(serializeEncounterBody(nextTitle, nextRows), "add");
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
		this.addSettingTab(new EncounterCastSettingTab(this.app, this));

		const refreshOnResize = () => {
			this.cleanupRegistry.debounce("status-refresh", 120, () => this.renderFoundationView());
		};
		this.registerDomEvent(window, "resize", refreshOnResize);
	}

	private resolvePluginAssetRootDir(): string {
		const adapter = this.app.vault.adapter as { getBasePath?: () => string; basePath?: string };
		const vaultBasePath =
			typeof adapter.getBasePath === "function"
				? adapter.getBasePath()
				: typeof adapter.basePath === "string"
					? adapter.basePath
					: null;
		if (vaultBasePath && vaultBasePath.length > 0) {
			return join(vaultBasePath, this.app.vault.configDir, "plugins", this.manifest.id);
		}
		return this.manifest.dir ?? ".";
	}

	onunload(): void {
		void this.encounterServer.stop();
		this.encounterWidgetComponents.clear();
		this.monsterManager.dispose();
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
			hoverPreviewEnabled: this.settings.hoverPreviewEnabled,
			hoverPreviewDelayMs: this.settings.hoverPreviewDelayMs,
			openCurrentMonsterOnNextTurn: this.settings.openCurrentMonsterOnNextTurn,
			dashboardHotkeysEnabled: this.settings.dashboardHotkeysEnabled,
			dashboardHotkeys: { ...this.settings.dashboardHotkeys },
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
		const prepared = prepareEncounterSource(source, this.monsterManager);
		if (!prepared.ok) {
			for (const error of prepared.errors.slice(0, 4)) {
				new Notice(`Line ${error.line}: ${error.message}`);
			}
			if (prepared.errors.length > 4) {
				new Notice(`${prepared.errors.length - 4} more encounter parsing errors.`);
			}
			return;
		}

		const totalCreatures = prepared.resolvedResult.resolved.reduce((sum, item) => sum + item.entry.quantity, 0);
		const hpRollTracker = this.settings.rollMonsterHp
			? await this.createMonsterHpRollTracker(prepared.resolvedResult.resolved)
			: null;
		const resolveHpForMonster = hpRollTracker ? hpRollTracker.resolve : undefined;
		if (mode === "run") {
			const players = preparePlayerCombatantsForCombatStart(getPlayerCombatants(this.currentSession));
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
			const nextSession = addCombatantsToSession(
				baseSession,
				prepared.parseResult.title,
				prepared.resolvedResult.resolved,
				{
					rollInitiative: true,
					insertByInitiative: true,
					resolveHpForMonster,
				},
			);
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
					resolveHpForMonster,
				})
			: createCombatSession(prepared.parseResult.title, prepared.resolvedResult.resolved, {
					resolveHpForMonster,
				});
		this.updateSession(nextSession);
		this.renderDashboardView();
		await this.openDashboardView();
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

		const updatedBody = serializeEncounterBody(title, rows);
		const queueTask = async () => {
			try {
				const updatedInEditor = tryPersistEncounterRowsInActiveEditor(this.app, ctx.sourcePath, sectionInfo, updatedBody);
				if (updatedInEditor) {
					return;
				}
				await this.app.vault.process(file, (current) => replaceEncounterSection(current, sectionInfo, updatedBody));
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to update encounter block.";
				new Notice(message);
			}
		};

		this.sourceWriteQueue = this.sourceWriteQueue.then(queueTask, queueTask);
		await this.sourceWriteQueue;
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

	private startEncounterFromDashboard(): void {
		if (!this.currentSession) {
			new Notice("No encounter available to run.");
			return;
		}

		const withClearedPlayerInitiative = clearPlayerInitiatives(this.currentSession);
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
		void (async () => {
			const selection = await pickMonsterOrCustom(this.app, this.monsterManager);
			if (!selection) {
				return;
			}

			void this.addMonsterToSession(selection.monster ?? createUnresolvedMonsterRecord(selection.monsterName));
		})();
	}

	private async addMonsterToSession(monster: MonsterRecord): Promise<void> {
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

		const hpRollTracker = this.settings.rollMonsterHp ? await this.createMonsterHpRollTracker([resolved]) : null;
		const nextSession = addCombatantsToSession(session, session.title, [resolved], {
			rollInitiative: this.encounterRunning,
			insertByInitiative: this.encounterRunning,
			resolveHpForMonster: hpRollTracker ? hpRollTracker.resolve : undefined,
		});
		this.updateSession(nextSession);
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

		const cleared = clearMonstersFromSessionState(this.currentSession, this.encounterRunning);
		this.encounterRunning = cleared.encounterRunning;
		this.updateSession(cleared.session);
		new Notice(monsterCount === 1 ? "1 monster removed." : `${monsterCount} monsters removed.`);
	}
	private advanceTurn(): void {
		if (!this.currentSession || !this.encounterRunning) {
			return;
		}
		const nextSession = advanceCombatTurn(this.currentSession);
		this.updateSession(nextSession);
		if (!this.settings.openCurrentMonsterOnNextTurn) {
			return;
		}
		const activeCombatant = nextSession.combatants[nextSession.activeIndex] ?? null;
		if (!activeCombatant || activeCombatant.isPlayer === true || activeCombatant.monster.id.startsWith("unresolved::")) {
			return;
		}
		void this.openMonsterInfo(activeCombatant.monster, "dashboard");
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

	private openDamageHealPlaceholder(combatantIds: string[]): void {
		if (!this.currentSession) {
			return;
		}
		const targets = this.currentSession.combatants.filter(
			(combatant) => combatantIds.includes(combatant.id) && combatant.isPlayer !== true,
		);
		if (targets.length === 0) {
			return;
		}

		new DamageHealModal(this.app, targets, (amount) => {
			this.applyDamageHealToCombatants(combatantIds, amount);
		}).open();
	}

	private applyDamageHealToCombatants(combatantIds: string[], amount: number): void {
		if (!this.currentSession || amount === 0) {
			return;
		}

		const result = applyDamageHealToCombatants(this.currentSession, combatantIds, amount);

		if (result.changed) {
			this.updateSession(result.session);
		}

		if (result.affectedCount > 0) {
			const action = amount > 0 ? "damage" : "healing";
			const magnitude = Math.abs(amount);
			new Notice(
				`Applied ${magnitude} ${action} to ${result.affectedCount} monster${result.affectedCount === 1 ? "" : "s"}.`,
			);
		}
		if (result.skippedCount > 0) {
			new Notice(
				`Skipped ${result.skippedCount} monster${result.skippedCount === 1 ? "" : "s"} with missing HP values.`,
			);
		}
	}

	private renameCombatant(combatantId: string): void {
		if (!this.currentSession) {
			return;
		}
		const combatant = this.currentSession.combatants.find((candidate) => candidate.id === combatantId) ?? null;
		if (!combatant || combatant.isPlayer === true) {
			return;
		}

		new CombatantRenameModal(this.app, combatant.name, (nextName) => {
			if (!this.currentSession) {
				return;
			}
			const trimmed = nextName.trim();
			const resolvedName = trimmed.length > 0 ? trimmed : combatant.monsterName;
			if (resolvedName === combatant.name) {
				return;
			}

			const nextCombatants = this.currentSession.combatants.map((candidate) =>
				candidate.id === combatantId
					? {
							...candidate,
							name: resolvedName,
						}
					: candidate,
			);
			this.updateSession({
				...this.currentSession,
				combatants: nextCombatants,
				updatedAt: new Date().toISOString(),
			});
		}).open();
	}

	private deleteCombatants(combatantIds: string[]): void {
		if (!this.currentSession) {
			return;
		}

		const uniqueIds = Array.from(new Set(combatantIds));
		let nextSession: CombatSession | null = this.currentSession;
		let removedCount = 0;
		for (const combatantId of uniqueIds) {
			if (!nextSession) {
				break;
			}
			const combatant = nextSession.combatants.find((candidate) => candidate.id === combatantId) ?? null;
			if (!combatant || combatant.isPlayer === true) {
				continue;
			}
			nextSession = removeCombatantFromSession(nextSession, combatantId);
			if (!nextSession) {
				continue;
			}
			removedCount += 1;
		}
		if (!nextSession || removedCount === 0) {
			return;
		}

		this.updateSession(nextSession);
		new Notice(removedCount === 1 ? "1 monster removed." : `${removedCount} monsters removed.`);
	}

	private duplicateCombatants(combatantIds: string[]): void {
		if (!this.currentSession) {
			return;
		}

		const { duplicateCount, session } = duplicateSelectedMonsters(this.currentSession, combatantIds);
		if (duplicateCount === 0) {
			return;
		}

		this.updateSession(session);
		new Notice(duplicateCount === 1 ? "1 monster duplicated." : `${duplicateCount} monsters duplicated.`);
	}

	private kickPlayers(combatantIds: string[]): void {
		if (!this.currentSession) {
			return;
		}
		if (!this.encounterServer.getState().running) {
			new Notice("Encounter server is offline.");
			return;
		}

		const uniqueIds = Array.from(new Set(combatantIds));
		let kickedCount = 0;
		let failedCount = 0;
		for (const combatantId of uniqueIds) {
			const combatant = this.currentSession.combatants.find((candidate) => candidate.id === combatantId) ?? null;
			if (!combatant || combatant.isPlayer !== true) {
				continue;
			}

			const kicked = this.encounterServer.kickPlayerByCombatantId(combatantId);
			if (kicked) {
				kickedCount += 1;
				continue;
			}
			failedCount += 1;
		}
		if (kickedCount === 0 && failedCount > 0) {
			new Notice("Failed to kick selected players.");
			return;
		}
		if (kickedCount > 0) {
			new Notice(kickedCount === 1 ? "Kicked 1 player." : `Kicked ${kickedCount} players.`);
		}
		if (failedCount > 0) {
			new Notice(`Failed to kick ${failedCount} selected player${failedCount === 1 ? "" : "s"}.`);
		}
	}

	private updateCombatantHp(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = parseIntegerInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantHp(this.currentSession, combatantId, parsed));
	}

	private updateCombatantHpMax(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = parseIntegerInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantHpMax(this.currentSession, combatantId, parsed));
	}

	private updateCombatantTempHp(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = parseIntegerInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantTempHp(this.currentSession, combatantId, parsed ?? 0));
	}

	private updateCombatantAc(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = parseIntegerInput(value);
		if (parsed === undefined) {
			return;
		}
		this.updateSession(setCombatantAc(this.currentSession, combatantId, parsed));
	}

	private updateCombatantDexMod(combatantId: string, value: string): void {
		if (!this.currentSession) {
			return;
		}
		const parsed = parseIntegerInput(value);
		if (parsed === undefined) {
			return;
		}

		this.updateSession(setCombatantDexMod(this.currentSession, combatantId, parsed));
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
			applyCombatServerRuntimeState(this.encounterServer, {
				theme: captureObsidianTheme(),
				supportUrl: resolveSupportUrlFromManifest(this.manifest),
				encounterRunning: this.encounterRunning,
				session: this.currentSession,
			});
			this.renderFoundationView();
			this.renderDashboardView();
			new Notice(buildEncounterServerStartSummary(state));
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

	private openInviteQrModal(url: string): void {
		new InviteQrModal(this.app, url).open();
	}

	async updateEncounterPartySettings(settings: EncounterPartySettings): Promise<void> {
		this.settings = {
			...this.settings,
			partyMembers: settings.partyMembers,
			partyLevel: settings.partyLevel,
		};
		await this.saveData(this.settings);
		this.refreshEncounterDifficultyViews();
	}

	async updateRollMonsterHpSetting(rollMonsterHp: boolean): Promise<void> {
		this.settings = {
			...this.settings,
			rollMonsterHp,
		};
		await this.saveData(this.settings);
	}

	async updateRollAllDiceOnMonsterInfoOpenSetting(rollAllDiceOnMonsterInfoOpen: boolean): Promise<void> {
		this.settings = {
			...this.settings,
			rollAllDiceOnMonsterInfoOpen,
		};
		await this.saveData(this.settings);
	}

	async updateDashboardHotkeysEnabledSetting(dashboardHotkeysEnabled: boolean): Promise<void> {
		this.settings = {
			...this.settings,
			dashboardHotkeysEnabled,
		};
		await this.saveData(this.settings);
		this.renderDashboardView();
	}

	async updateDashboardHotkeySetting(action: DashboardHotkeyAction, binding: string): Promise<void> {
		this.settings = {
			...this.settings,
			dashboardHotkeys: {
				...this.settings.dashboardHotkeys,
				[action]: normalizeHotkey(binding),
			},
		};
		await this.saveData(this.settings);
		this.renderDashboardView();
	}

	async updateOpenCurrentMonsterOnNextTurnSetting(openCurrentMonsterOnNextTurn: boolean): Promise<void> {
		this.settings = {
			...this.settings,
			openCurrentMonsterOnNextTurn,
		};
		await this.saveData(this.settings);
	}

	async updateHoverPreviewSettings(settings: {
		hoverPreviewEnabled: boolean;
		hoverPreviewDelayMs: number;
		hoverPreviewHideDelayMs: number;
	}): Promise<void> {
		const hoverPreviewDelayMs = normalizeHoverDelay(settings.hoverPreviewDelayMs, DEFAULT_SETTINGS.hoverPreviewDelayMs);
		const hoverPreviewHideDelayMs = normalizeHoverDelay(
			settings.hoverPreviewHideDelayMs,
			DEFAULT_SETTINGS.hoverPreviewHideDelayMs,
		);
		this.settings = {
			...this.settings,
			hoverPreviewEnabled: settings.hoverPreviewEnabled,
			hoverPreviewDelayMs,
			hoverPreviewHideDelayMs,
		};
		await this.saveData(this.settings);
		if (!this.settings.hoverPreviewEnabled) {
			this.monsterManager.hideCreatureHoverPreview();
		}
		this.refreshEncounterHoverPreviewViews();
		this.renderDashboardView();
	}

	async updateHoverPreviewLayoutSettings(settings: {
		hoverPreviewWidthPx: number;
		hoverPreviewWideColumns: boolean;
	}): Promise<void> {
		const hoverPreviewWidthPx = normalizeHoverWidth(settings.hoverPreviewWidthPx, DEFAULT_SETTINGS.hoverPreviewWidthPx);
		this.settings = {
			...this.settings,
			hoverPreviewWidthPx,
			hoverPreviewWideColumns: settings.hoverPreviewWideColumns,
		};
		await this.saveData(this.settings);
		this.monsterManager.setHoverPreviewLayout(hoverPreviewWidthPx, settings.hoverPreviewWideColumns);
	}

	private openPartySettingsModal(): void {
		const modal = new PartySettingsModal(
			this.app,
			{ partyMembers: this.settings.partyMembers, partyLevel: this.settings.partyLevel },
			async (settings) => {
				await this.updateEncounterPartySettings(settings);
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

	private refreshEncounterHoverPreviewViews(): void {
		for (const component of this.encounterWidgetComponents) {
			component.updateHoverPreviewSettings(this.settings.hoverPreviewEnabled, this.settings.hoverPreviewDelayMs);
		}
	}

	private async openMonsterInfo(monster: MonsterRecord, source: "dashboard" | "codeblock"): Promise<void> {
		try {
			await this.monsterManager.openCreaturePreview(monster);
			if (source === "dashboard" && this.settings.rollAllDiceOnMonsterInfoOpen) {
				await this.monsterManager.rollAllCreaturePreviewDice();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to open creature preview.";
			new Notice(message);
		}
	}

	private async openMonsterHoverInfo(monster: MonsterRecord, anchorEl: HTMLElement): Promise<void> {
		if (!this.settings.hoverPreviewEnabled) {
			return;
		}
		try {
			await this.monsterManager.showCreatureHoverPreview(monster, anchorEl);
		} catch {
			// Intentionally ignore hover preview failures to avoid noisy notices while mousing around.
		}
	}

	private closeMonsterHoverInfo(): void {
		this.monsterManager.scheduleHideCreatureHoverPreview(this.settings.hoverPreviewHideDelayMs);
	}

	private async createMonsterHpRollTracker(entries: ResolvedEncounterEntry[]): Promise<{
		resolve: (monster: MonsterRecord) => number | null;
	}> {
		const hpQueueByMonsterId = new Map<string, number[]>();
		const canRollWithDice = this.diceRollerAdapter.isAvailable();

		for (const entry of entries) {
			for (let copyIndex = 0; copyIndex < entry.entry.quantity; copyIndex++) {
				const formula = entry.monster.hp_formula?.trim();
				if (!formula) {
					continue;
				}
				if (!canRollWithDice) {
					continue;
				}

				const rolled = await this.diceRollerAdapter.rollFormula(formula, "encounter-cast");
				if (rolled === null) {
					continue;
				}

				const queue = hpQueueByMonsterId.get(entry.monster.id) ?? [];
				queue.push(rolled);
				hpQueueByMonsterId.set(entry.monster.id, queue);
			}
		}

		return {
			resolve: (monster: MonsterRecord) => {
				const queue = hpQueueByMonsterId.get(monster.id);
				if (!queue || queue.length === 0) {
					return null;
				}
				return queue.shift() ?? null;
			},
		};
	}
}
