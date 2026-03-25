import { ButtonComponent, Modal, Setting, TextComponent, type App } from "obsidian";

export class CombatantRenameModal extends Modal {
	private readonly initialName: string;
	private readonly onSubmit: (nextName: string) => void;
	private text: TextComponent | null = null;

	constructor(app: App, initialName: string, onSubmit: (nextName: string) => void) {
		super(app);
		this.initialName = initialName;
		this.onSubmit = onSubmit;
	}

	override onOpen(): void {
		this.setTitle("Rename combatant");
		this.contentEl.empty();

		new Setting(this.contentEl)
			.setName("Name")
			.addText((text) => {
				this.text = text;
				text.setPlaceholder("Combatant name");
				text.setValue(this.initialName);
				text.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
					if (event.key === "Enter") {
						event.preventDefault();
						this.submit();
					}
				});
			});

		const buttonRow = this.contentEl.createDiv({ cls: "encounter-cast-modal-actions" });
		new ButtonComponent(buttonRow)
			.setButtonText("Cancel")
			.onClick(() => this.close());
		new ButtonComponent(buttonRow)
			.setButtonText("Save")
			.setCta()
			.onClick(() => this.submit());

		this.text?.inputEl.focus();
		this.text?.inputEl.select();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.text = null;
	}

	private submit(): void {
		const value = this.text?.getValue() ?? this.initialName;
		this.onSubmit(value);
		this.close();
	}
}

