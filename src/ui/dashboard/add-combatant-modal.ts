import { FuzzySuggestModal, type App, type FuzzyMatch } from "obsidian";
import type { MonsterManager } from "../../monsters/monster-manager";
import type { MonsterRecord } from "../../monsters/types";

export class AddCombatantModal extends FuzzySuggestModal<MonsterRecord> {
	private selected = false;

	constructor(
		app: App,
		private readonly monsterManager: MonsterManager,
		private readonly onSelect: (monster: MonsterRecord) => void,
		private readonly onCancel?: () => void,
	) {
		super(app);
		this.setTitle("Add monster to encounter");
	}

	getItems(): MonsterRecord[] {
		return this.monsterManager.getAllMonsters();
	}

	getItemText(item: MonsterRecord): string {
		return item.name;
	}

	renderSuggestion(match: FuzzyMatch<MonsterRecord>, el: HTMLElement): void {
		const item = match.item;
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		content.createDiv({ cls: "suggestion-title", text: item.name });
		const details = [
			item.challenge ? `CR ${item.challenge}` : "CR -",
			item.max_hp !== null ? `HP ${item.max_hp}` : "HP -",
			item.ac !== null ? `AC ${item.ac}` : "AC -",
		].join(" | ");
		content.createDiv({ cls: "suggestion-note", text: details });
	}

	onChooseItem(item: MonsterRecord): void {
		this.selected = true;
		this.onSelect(item);
		this.close();
	}

	onClose(): void {
		// Defer cancel resolution so a selection can mark `selected` first
		// even if close/onChoose ordering interleaves.
		queueMicrotask(() => {
			if (!this.selected) {
				this.onCancel?.();
			}
		});
	}
}

