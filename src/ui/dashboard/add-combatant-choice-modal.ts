import { Modal, Setting, type App } from "obsidian";

interface AddCombatantChoiceModalOptions {
	onChooseMonster: () => void;
	onCustomMonster: () => void;
	onCancel?: () => void;
}

export class AddCombatantChoiceModal extends Modal {
	private handled = false;

	constructor(app: App, private readonly options: AddCombatantChoiceModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Add combatant");
		this.contentEl.empty();

		new Setting(this.contentEl)
			.setName("Choose monster")
			.setDesc("Pick a known monster from fuzzy search.")
			.addButton((button) => {
				button.setButtonText("Choose monster");
				button.setCta();
				button.onClick(() => {
					this.handled = true;
					this.close();
					this.options.onChooseMonster();
				});
			});

		new Setting(this.contentEl)
			.setName("Custom monster")
			.setDesc("Enter a custom monster name with empty stats.")
			.addButton((button) => {
				button.setButtonText("Custom monster");
				button.onClick(() => {
					this.handled = true;
					this.close();
					this.options.onCustomMonster();
				});
			});
	}

	onClose(): void {
		if (!this.handled) {
			this.options.onCancel?.();
		}
	}
}

