import { Modal, Notice, Setting, type App } from "obsidian";

export class CustomMonsterModal extends Modal {
	private nameValue = "";
	private submitted = false;

	constructor(
		app: App,
		private readonly onSubmit: (name: string) => void,
		private readonly onCancel?: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Custom monster");
		this.contentEl.empty();

		new Setting(this.contentEl).setName("Name").addText((text) => {
			text.setPlaceholder("Example: fire cultist");
			text.setValue(this.nameValue);
			text.onChange((value) => {
				this.nameValue = value;
			});
			text.inputEl.focus();
		});

		new Setting(this.contentEl)
			.addButton((button) => {
				button.setButtonText("Add");
				button.setCta();
				button.onClick(() => {
					this.submit();
				});
			})
			.addExtraButton((button) => {
				button.setIcon("cross");
				button.setTooltip("Cancel");
				button.onClick(() => this.close());
			});
	}

	onClose(): void {
		if (!this.submitted) {
			this.onCancel?.();
		}
	}

	private submit(): void {
		const name = this.nameValue.trim();
		if (!name.length) {
			new Notice("Monster name is required.");
			return;
		}

		this.submitted = true;
		this.close();
		this.onSubmit(name);
	}
}


