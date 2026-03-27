import { ItemView, WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import { DashboardPanel } from "./dashboard-panel";
import type { DashboardActions, DashboardViewModel } from "./types";

export const DASHBOARD_VIEW_TYPE = "encounter-cast-dm-dashboard";

const EMPTY_MODEL: DashboardViewModel = {
	session: null,
	encounterRunning: false,
	serverRunning: false,
	serverPort: null,
	roomToken: null,
	inviteUrls: [],
	hoverPreviewEnabled: true,
	hoverPreviewDelayMs: 500,
};

export class DashboardItemView extends ItemView {
	private model: DashboardViewModel = EMPTY_MODEL;

	constructor(leaf: WorkspaceLeaf, private readonly actions: DashboardActions) {
		super(leaf);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Encounter cast";
	}

	getIcon(): string {
		return "swords";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("encounter-cast-dashboard-view");
		this.renderView();
	}

	async onClose(): Promise<void> {
		render(null, this.contentEl);
		this.contentEl.empty();
	}

	update(model: DashboardViewModel): void {
		this.model = model;
		this.renderView();
	}

	private renderView(): void {
		render(<DashboardPanel model={this.model} actions={this.actions} />, this.contentEl);
	}
}
