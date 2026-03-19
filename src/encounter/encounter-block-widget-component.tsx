import { MarkdownRenderChild } from "obsidian";
import { render } from "preact";
import { EncounterBlockWidget, type EncounterPreviewRow } from "../ui/encounter/encounter-block-widget";
import type { MonsterRecord } from "../monsters/types";

interface EncounterBlockWidgetComponentProps {
	title: string | null;
	rows: EncounterPreviewRow[];
	onInfo: (monster: MonsterRecord) => void;
	onRowsChange: (rows: EncounterPreviewRow[]) => void;
	onRunEncounter: (rows: EncounterPreviewRow[]) => void;
	onAddToEncounter: (rows: EncounterPreviewRow[]) => void;
}

export class EncounterBlockWidgetComponent extends MarkdownRenderChild {
	private readonly props: EncounterBlockWidgetComponentProps;

	constructor(containerEl: HTMLElement, props: EncounterBlockWidgetComponentProps) {
		super(containerEl);
		this.props = props;
	}

	onload(): void {
		this.renderWidget();
	}

	onunload(): void {
		render(null, this.containerEl);
	}

	private renderWidget(): void {
		render(
			<EncounterBlockWidget
				title={this.props.title}
				rows={this.props.rows}
				onInfo={this.props.onInfo}
				onRowsChange={this.props.onRowsChange}
				onRunEncounter={this.props.onRunEncounter}
				onAddToEncounter={this.props.onAddToEncounter}
			/>,
			this.containerEl,
		);
	}
}
