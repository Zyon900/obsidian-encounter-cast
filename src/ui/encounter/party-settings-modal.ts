import { Modal, Notice, Setting, type App } from "obsidian";
import type { EncounterPartySettings } from "../../encounter/encounter-difficulty";

type SaveHandler = (settings: EncounterPartySettings) => Promise<void> | void;

export class PartySettingsModal extends Modal {
	private partyMembersValue: string;
	private partyLevelValue: string;

	constructor(
		app: App,
		private readonly initialSettings: EncounterPartySettings,
		private readonly onSave: SaveHandler,
	) {
		super(app);
		this.partyMembersValue = initialSettings.partyMembers?.toString() ?? "";
		this.partyLevelValue = initialSettings.partyLevel?.toString() ?? "";
	}

	onOpen(): void {
		this.titleEl.setText("Encounter settings");
		this.contentEl.empty();

		new Setting(this.contentEl).setName("Party members").addText((text) => {
			text.setPlaceholder("e.g. 4");
			text.setValue(this.partyMembersValue);
			text.inputEl.type = "number";
			text.inputEl.min = "1";
			text.onChange((value) => {
				this.partyMembersValue = value;
			});
		});

		new Setting(this.contentEl).setName("Party member level").addText((text) => {
			text.setPlaceholder("1-20");
			text.setValue(this.partyLevelValue);
			text.inputEl.type = "number";
			text.inputEl.min = "1";
			text.inputEl.max = "20";
			text.onChange((value) => {
				this.partyLevelValue = value;
			});
		});

		new Setting(this.contentEl)
			.addButton((button) => {
				button.setButtonText("Save");
				button.setCta();
				button.onClick(() => {
					void this.save();
				});
			})
			.addExtraButton((button) => {
				button.setIcon("cross");
				button.setTooltip("Cancel");
				button.onClick(() => this.close());
			});
	}

	private async save(): Promise<void> {
		const partyMembers = parseOptionalInt(this.partyMembersValue);
		const partyLevel = parseOptionalInt(this.partyLevelValue);
		if (partyMembers !== null && partyMembers <= 0) {
			new Notice("Party members must be at least 1.");
			return;
		}

		if (partyLevel !== null && (partyLevel < 1 || partyLevel > 20)) {
			new Notice("Party member level must be between 1 and 20.");
			return;
		}

		await this.onSave({ partyMembers, partyLevel });
		this.close();
	}
}

function parseOptionalInt(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed.length) {
		return null;
	}

	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : null;
}
