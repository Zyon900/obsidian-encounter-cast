import { MarkdownRenderChild } from "obsidian";
import { render } from "preact";
import { EncounterBlockWidget, type EncounterPreviewRow } from "../ui/encounter/encounter-block-widget";
import type { MonsterRecord } from "../monsters/types";
import type { EncounterPartySettings } from "./encounter-difficulty";

interface EncounterBlockWidgetComponentProps {
	title: string | null;
	rows: EncounterPreviewRow[];
	partySettings: EncounterPartySettings;
	onInfo: (monster: MonsterRecord) => void;
	onHoverInfo: (monster: MonsterRecord, anchorEl: HTMLElement) => void;
	onHoverLeave: () => void;
	onRowsChange: (rows: EncounterPreviewRow[], title: string | null) => void;
	onTitleChange: (rows: EncounterPreviewRow[], title: string | null) => void;
	onRunEncounter: (rows: EncounterPreviewRow[], title: string | null) => void;
	onAddToEncounter: (rows: EncounterPreviewRow[], title: string | null) => void;
	onOpenPartySettings: () => void;
	onDispose?: () => void;
}

export class EncounterBlockWidgetComponent extends MarkdownRenderChild {
	private props: EncounterBlockWidgetComponentProps;

	constructor(containerEl: HTMLElement, props: EncounterBlockWidgetComponentProps) {
		super(containerEl);
		this.props = props;
	}

	onload(): void {
		this.renderWidget();
	}

	onunload(): void {
		render(null, this.containerEl);
		this.props.onDispose?.();
	}

	updatePartySettings(partySettings: EncounterPartySettings): void {
		this.props = { ...this.props, partySettings };
		this.renderWidget();
	}

	private renderWidget(): void {
		render(
			<EncounterBlockWidget
				title={this.props.title}
				rows={this.props.rows}
				partySettings={this.props.partySettings}
				onInfo={this.props.onInfo}
				onHoverInfo={this.props.onHoverInfo}
				onHoverLeave={this.props.onHoverLeave}
				onRowsChange={this.props.onRowsChange}
				onTitleChange={this.props.onTitleChange}
				onRunEncounter={this.props.onRunEncounter}
				onAddToEncounter={this.props.onAddToEncounter}
				onOpenPartySettings={this.props.onOpenPartySettings}
			/>,
			this.containerEl,
		);
	}
}
