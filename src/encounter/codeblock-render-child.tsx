import { MarkdownRenderChild } from "obsidian";
import { render } from "preact";
import { CodeblockWidget, type CodeblockRow } from "../ui/encounter/codeblock-widget";
import type { MonsterRecord } from "../monsters/types";
import type { EncounterPartySettings } from "./codeblock-difficulty";

interface CodeblockRenderChildProps {
	title: string | null;
	rows: CodeblockRow[];
	partySettings: EncounterPartySettings;
	hoverPreviewEnabled: boolean;
	hoverPreviewDelayMs: number;
	onInfo: (monster: MonsterRecord) => void;
	onHoverInfo: (monster: MonsterRecord, anchorEl: HTMLElement) => void;
	onHoverLeave: () => void;
	onRowsChange: (rows: CodeblockRow[], title: string | null) => void;
	onTitleChange: (rows: CodeblockRow[], title: string | null) => void;
	onRunEncounter: (rows: CodeblockRow[], title: string | null) => void;
	onAddToEncounter: (rows: CodeblockRow[], title: string | null) => void;
	onSelectMonsterForCodeblock: () => Promise<string | null>;
	onDispose?: () => void;
}

export class CodeblockRenderChild extends MarkdownRenderChild {
	private props: CodeblockRenderChildProps;

	constructor(containerEl: HTMLElement, props: CodeblockRenderChildProps) {
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

	updateHoverPreviewSettings(hoverPreviewEnabled: boolean, hoverPreviewDelayMs: number): void {
		this.props = { ...this.props, hoverPreviewEnabled, hoverPreviewDelayMs };
		this.renderWidget();
	}

	private renderWidget(): void {
		render(
			<CodeblockWidget
				title={this.props.title}
				rows={this.props.rows}
				partySettings={this.props.partySettings}
				hoverPreviewEnabled={this.props.hoverPreviewEnabled}
				hoverPreviewDelayMs={this.props.hoverPreviewDelayMs}
				onInfo={this.props.onInfo}
				onHoverInfo={this.props.onHoverInfo}
				onHoverLeave={this.props.onHoverLeave}
				onRowsChange={this.props.onRowsChange}
				onTitleChange={this.props.onTitleChange}
				onRunEncounter={this.props.onRunEncounter}
				onAddToEncounter={this.props.onAddToEncounter}
				onSelectMonsterForCodeblock={this.props.onSelectMonsterForCodeblock}
			/>,
			this.containerEl,
		);
	}
}
