import { Notice, Plugin } from "obsidian";
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

}
