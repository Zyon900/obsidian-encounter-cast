import { Notice, Plugin } from "obsidian";
import { EncounterBlockWidgetComponent } from "./encounter/encounter-block-widget-component";
import { createEncounterEditorKeymap } from "./encounter/encounter-editor-keymap";
import { parseEncounterBlock, summarizeEncounterSource } from "./encounter/encounter-parser";
import { resolveEncounterEntries } from "./encounter/encounter-resolver";
import { EncounterSuggest } from "./encounter/encounter-suggest";
import type { MonsterRecord } from "./monsters/types";
import { FantasyStatblocksAdapter } from "./monsters/fantasy-statblocks-adapter";
import { MonsterManager } from "./monsters/monster-manager";
import { EncounterServer } from "./network/encounter-server";
import { PreactMount } from "./ui/preact-mount";
import { CleanupRegistry } from "./utils/cleanup-registry";

export default class EncounterCastPlugin extends Plugin {
	private readonly cleanupRegistry = new CleanupRegistry();
	private readonly encounterServer = new EncounterServer();
	private readonly monsterManager = new MonsterManager(new FantasyStatblocksAdapter(this.app));
	private preactMount: PreactMount | null = null;
	private statusBarRoot: HTMLElement | null = null;

	async onload(): Promise<void> {
		this.statusBarRoot = this.addStatusBarItem();
		this.statusBarRoot.addClass("encounter-cast-status-root");
		this.preactMount = new PreactMount(this.statusBarRoot);
		await this.monsterManager.initialize();
		this.renderFoundationView();
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

		this.registerMarkdownCodeBlockProcessor("encounter", (source, el, ctx) => {
			el.empty();
			const summary = summarizeEncounterSource(source);
			const parseResult = parseEncounterBlock(source);
			const resolvedResult = resolveEncounterEntries(parseResult.entries, this.monsterManager);
			const resolvedByLine = new Map(
				resolvedResult.resolved.map((item) => [item.entry.line, item]),
			);
			const rows = parseResult.entries.map((entry) => {
				const resolved = resolvedByLine.get(entry.line);
				if (!resolved) {
					return {
						id: `unresolved-${entry.line}-${entry.monsterQuery}`,
						quantity: entry.quantity,
						customName: entry.customName,
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
				onRunEncounter: () => {
					void this.handleEncounterAction(source, "run");
				},
				onAddToEncounter: () => {
					void this.handleEncounterAction(source, "add");
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
		const parseResult = parseEncounterBlock(source);
		if (parseResult.errors.length > 0) {
			for (const error of parseResult.errors.slice(0, 4)) {
				new Notice(`Line ${error.line}: ${error.message}`);
			}
			if (parseResult.errors.length > 4) {
				new Notice(`${parseResult.errors.length - 4} more encounter parsing errors.`);
			}
			return;
		}

		const resolvedResult = resolveEncounterEntries(parseResult.entries, this.monsterManager);
		if (resolvedResult.unresolved.length > 0) {
			for (const unresolved of resolvedResult.unresolved.slice(0, 4)) {
				new Notice(`Line ${unresolved.line}: Could not resolve "${unresolved.monsterQuery}".`);
			}
			if (resolvedResult.unresolved.length > 4) {
				new Notice(`${resolvedResult.unresolved.length - 4} more unresolved encounter rows.`);
			}
			return;
		}

		const totalCreatures = resolvedResult.resolved.reduce((sum, item) => sum + item.entry.quantity, 0);
		if (mode === "run") {
			new Notice(`Encounter parsed. ${totalCreatures} creatures ready to run.`);
			return;
		}

		new Notice(`Encounter parsed. ${totalCreatures} creatures ready to add.`);
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
