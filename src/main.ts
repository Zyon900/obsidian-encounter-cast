import { Notice, Plugin } from "obsidian";
import { EncounterServer } from "./network/encounter-server";
import { PreactMount } from "./ui/preact-mount";
import { CleanupRegistry } from "./utils/cleanup-registry";

export default class EncounterCastPlugin extends Plugin {
	private readonly cleanupRegistry = new CleanupRegistry();
	private readonly encounterServer = new EncounterServer();
	private preactMount: PreactMount | null = null;
	private statusBarRoot: HTMLElement | null = null;

	async onload(): Promise<void> {
		this.statusBarRoot = this.addStatusBarItem();
		this.statusBarRoot.addClass("encounter-cast-status-root");
		this.preactMount = new PreactMount(this.statusBarRoot);
		this.renderFoundationView();

		this.addCommand({
			id: "start-local-server",
			name: "Start local server",
			callback: async () => {
				const state = await this.encounterServer.start();
				this.renderFoundationView();
				new Notice(`Server started on port ${state.port ?? "unknown"}.`);
			},
		});

		this.addCommand({
			id: "stop-local-server",
			name: "Stop local server",
			callback: async () => {
				await this.encounterServer.stop();
				this.renderFoundationView();
				new Notice("Server stopped.");
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
		this.preactMount?.update({
			serverRunning: state.running,
			serverPort: state.port,
		});
	}
}
