import {
	EditorSuggest,
	type App,
	type Editor,
	type EditorPosition,
	type EditorSuggestContext,
	type EditorSuggestTriggerInfo,
	type TFile,
} from "obsidian";
import type { MonsterManager } from "../monsters/monster-manager";
import type { MonsterSearchHit } from "../monsters/types";

interface EncounterLineTrigger {
	line: number;
	fromCh: number;
	quantityPrefix: string;
	query: string;
}

const ENCOUNTER_QUERY_PATTERN = /^(\s*\d+\s*x\s+)([^'\n]*)$/i;

export class EncounterSuggest extends EditorSuggest<MonsterSearchHit> {
	private readonly monsterManager: MonsterManager;

	constructor(app: App, monsterManager: MonsterManager) {
		super(app);
		this.monsterManager = monsterManager;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		if (!file) {
			return null;
		}

		if (!this.isInsideEncounterCodeBlock(editor, cursor.line)) {
			return null;
		}

		const trigger = this.getTriggerForLine(editor, cursor);
		if (!trigger) {
			return null;
		}

		return {
			start: { line: trigger.line, ch: trigger.fromCh },
			end: { line: trigger.line, ch: cursor.ch },
			query: trigger.query,
		};
	}

	getSuggestions(context: EditorSuggestContext): MonsterSearchHit[] {
		return this.monsterManager.searchMonsters(context.query);
	}

	renderSuggestion(value: MonsterSearchHit, el: HTMLElement): void {
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		content.createDiv({ cls: "suggestion-title", text: value.monster.name });
		const details = [
			value.monster.challenge ? `CR ${value.monster.challenge}` : "CR -",
			value.monster.hp !== null ? `HP ${value.monster.hp}` : "HP -",
			value.monster.ac !== null ? `AC ${value.monster.ac}` : "AC -",
		].join(" | ");
		content.createDiv({ cls: "suggestion-note", text: details });
	}

	selectSuggestion(value: MonsterSearchHit): void {
		if (!this.context) {
			return;
		}

		const editor = this.context.editor;
		const cursor = editor.getCursor();
		const trigger = this.getTriggerForLine(editor, cursor);
		if (!trigger) {
			this.close();
			return;
		}

		const replacement = `${trigger.quantityPrefix}${value.monster.name} ''`;
		editor.replaceRange(
			replacement,
			{ line: trigger.line, ch: 0 },
			{ line: trigger.line, ch: editor.getLine(trigger.line).length },
		);
		editor.setCursor({ line: trigger.line, ch: replacement.length - 1 });
		this.close();
	}

	private getTriggerForLine(editor: Editor, cursor: EditorPosition): EncounterLineTrigger | null {
		const line = editor.getLine(cursor.line);
		const beforeCursor = line.slice(0, cursor.ch);
		const match = ENCOUNTER_QUERY_PATTERN.exec(beforeCursor);
		if (!match) {
			return null;
		}

		const quantityPrefix = match[1] ?? "";
		const rawQuery = match[2] ?? "";
		const query = rawQuery.trim();
		if (rawQuery.endsWith(" ") && query.length > 0) {
			return null;
		}

		return {
			line: cursor.line,
			fromCh: quantityPrefix.length,
			quantityPrefix,
			query,
		};
	}

	private isInsideEncounterCodeBlock(editor: Editor, line: number): boolean {
		let inEncounterFence = false;
		for (let current = 0; current <= line; current++) {
			const text = editor.getLine(current).trim();
			if (!text.startsWith("```")) {
				continue;
			}

			const language = text.slice(3).trim().toLowerCase();
			if (!inEncounterFence && language === "encounter") {
				inEncounterFence = true;
				continue;
			}

			if (inEncounterFence) {
				inEncounterFence = false;
			}
		}

		return inEncounterFence;
	}
}
