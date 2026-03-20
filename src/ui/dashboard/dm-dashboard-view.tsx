import { ItemView, WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import { DmDashboard } from "./dm-dashboard";
import type { DashboardActions, DashboardViewModel } from "./types";

export const DM_DASHBOARD_VIEW_TYPE = "encounter-cast-dm-dashboard";

const EMPTY_MODEL: DashboardViewModel = {
	session: null,
	encounterRunning: false,
	serverRunning: false,
	serverPort: null,
	roomToken: null,
	inviteUrls: [],
};

export class DmDashboardView extends ItemView {
	private model: DashboardViewModel = EMPTY_MODEL;

	constructor(leaf: WorkspaceLeaf, private readonly actions: DashboardActions) {
		super(leaf);
	}

	getViewType(): string {
		return DM_DASHBOARD_VIEW_TYPE;
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
		render(<DmDashboard model={this.model} actions={this.actions} />, this.contentEl);
	}
}


