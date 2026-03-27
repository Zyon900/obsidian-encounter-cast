import { ButtonComponent, Modal, Notice, Setting, type App } from "obsidian";
import type { Combatant } from "../../encounter/combat-session";

type MonsterTypeSummary = {
	monsterId: string;
	name: string;
	vulnerabilities: string[];
	resistances: string[];
	immunities: string[];
};

export class DamageHealModal extends Modal {
	private readonly combatants: Combatant[];
	private readonly onSubmit: (amount: number) => void;
	private inputEl: HTMLInputElement | null = null;
	private applyButton: ButtonComponent | null = null;

	constructor(app: App, combatants: Combatant[], onSubmit: (amount: number) => void) {
		super(app);
		this.combatants = combatants;
		this.onSubmit = onSubmit;
	}

	override onOpen(): void {
		this.setTitle("Damage / heal");
		this.contentEl.empty();
		this.contentEl.addClass("encounter-cast-damage-heal-modal-content");

		const amountSetting = new Setting(this.contentEl)
			.setName("Amount")
			.setDesc("Positive values deal damage. Negative values heal.");
		const inputEl = amountSetting.controlEl.createEl("input", {
			type: "number",
			placeholder: "7 or -7",
			cls: "encounter-cast-damage-heal-input",
		});
		this.inputEl = inputEl;
		this.inputEl.addEventListener("input", () => {
			this.updateApplyButtonState();
		});
		this.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				this.close();
				return;
			}
			if (event.key !== "Enter") {
				return;
			}
			event.preventDefault();
			this.submit();
		});

		const details = this.contentEl.createDiv({ cls: "encounter-cast-damage-heal-types" });
		details.createEl("h4", { text: "Selected monster types" });
		const listEl = details.createEl("div", { cls: "encounter-cast-damage-heal-type-list" });
		for (const summary of this.buildMonsterTypeSummaries()) {
			const itemEl = listEl.createDiv({ cls: "encounter-cast-damage-heal-type-item" });
			itemEl.createEl("strong", { text: summary.name });
			this.renderProfileLine(itemEl, "Vulnerabilities", summary.vulnerabilities);
			this.renderProfileLine(itemEl, "Resistances", summary.resistances);
			this.renderProfileLine(itemEl, "Immunities", summary.immunities);
		}

		const buttonRow = this.contentEl.createDiv({ cls: "encounter-cast-modal-actions" });
		new ButtonComponent(buttonRow).setButtonText("Cancel").onClick(() => this.close());
		this.applyButton = new ButtonComponent(buttonRow)
			.setButtonText("Apply")
			.setCta()
			.onClick(() => this.submit());
		this.updateApplyButtonState();

		this.inputEl.focus();
		this.inputEl.select();
	}

	override onClose(): void {
		this.contentEl.empty();
		this.inputEl = null;
		this.applyButton = null;
	}

	private buildMonsterTypeSummaries(): MonsterTypeSummary[] {
		const uniqueTypes = new Map<string, MonsterTypeSummary>();
		for (const combatant of this.combatants) {
			if (combatant.isPlayer === true) {
				continue;
			}

			const monster = combatant.monster;
			if (uniqueTypes.has(monster.id)) {
				continue;
			}

			uniqueTypes.set(monster.id, {
				monsterId: monster.id,
				name: monster.name,
				vulnerabilities: monster.damage_vulnerabilities,
				resistances: monster.damage_resistances,
				immunities: monster.damage_immunities,
			});
		}

		return Array.from(uniqueTypes.values()).sort((left, right) => left.name.localeCompare(right.name));
	}

	private renderProfileLine(container: HTMLElement, label: string, values: string[]): void {
		if (values.length === 0) {
			return;
		}

		const lineEl = container.createDiv({ cls: "encounter-cast-damage-heal-type-line" });
		lineEl.createSpan({ cls: "encounter-cast-damage-heal-type-label", text: `${label}:` });
		lineEl.createSpan({
			cls: "encounter-cast-damage-heal-type-values",
			text: values.join(", "),
		});
	}

	private parseInputAmount(): number | null {
		const raw = this.inputEl?.value.trim() ?? "";
		if (!raw.length) {
			return null;
		}
		const parsed = Number.parseInt(raw, 10);
		if (!Number.isFinite(parsed) || parsed === 0) {
			return null;
		}
		return parsed;
	}

	private updateApplyButtonState(): void {
		this.applyButton?.setDisabled(this.parseInputAmount() === null);
	}

	private submit(): void {
		const amount = this.parseInputAmount();
		if (amount === null) {
			new Notice("Enter a non-zero number.");
			return;
		}

		this.onSubmit(amount);
		this.close();
	}
}
