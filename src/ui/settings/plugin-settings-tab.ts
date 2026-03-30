import { PluginSettingTab, Setting, type App } from "obsidian";
import EncounterCastPlugin from "../../main";
import { DASHBOARD_HOTKEY_FIELDS, hotkeyFromKeyboardEvent, normalizeHotkey, type DashboardHotkeyAction } from "../dashboard/hotkeys";

export class EncounterCastSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: EncounterCastPlugin) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.getSettingsSnapshot();

		new Setting(containerEl).setName("Encounter difficulty").setHeading();
		this.addNumberSetting({
			name: "Party members",
			desc: "Number of player characters for encounter difficulty.",
			initialValue: settings.partyMembers,
			placeholder: "Unset",
			min: 1,
			max: 20,
			onSave: async (value) => {
				const current = this.plugin.getSettingsSnapshot();
				await this.plugin.updateEncounterPartySettings({
					partyMembers: value,
					partyLevel: current.partyLevel,
				});
			},
		});

		this.addNumberSetting({
			name: "Party level",
			desc: "Average party level used for encounter difficulty.",
			initialValue: settings.partyLevel,
			placeholder: "Unset",
			min: 1,
			max: 20,
			onSave: async (value) => {
				const current = this.plugin.getSettingsSnapshot();
				await this.plugin.updateEncounterPartySettings({
					partyMembers: current.partyMembers,
					partyLevel: value,
				});
			},
		});

		new Setting(containerEl)
			.setName("Roll monster hp on add")
			.setDesc("Roll monster max hp from fantasy statblocks using dice roller instead of average hp.")
			.addToggle((toggle) =>
				toggle.setValue(settings.rollMonsterHp).onChange((value) => {
					void this.plugin.updateRollMonsterHpSetting(value);
				}),
			);

		new Setting(containerEl)
			.setName("Roll all dice on monster info open")
			.setDesc("When opening monster info from the dashboard, click all rendered statblock dice in the creature pane.")
			.addToggle((toggle) =>
				toggle.setValue(settings.rollAllDiceOnMonsterInfoOpen).onChange((value) => {
					void this.plugin.updateRollAllDiceOnMonsterInfoOpenSetting(value);
				}),
			);

		new Setting(containerEl).setName("Monster hover preview").setHeading();
		new Setting(containerEl)
			.setName("Enable monster hover preview")
			.setDesc("Show a statblock preview when hovering monster names.")
			.addToggle((toggle) =>
				toggle.setValue(settings.hoverPreviewEnabled).onChange((value) => {
					const current = this.plugin.getSettingsSnapshot();
					void this.plugin.updateHoverPreviewSettings({
						hoverPreviewEnabled: value,
						hoverPreviewDelayMs: current.hoverPreviewDelayMs,
						hoverPreviewHideDelayMs: current.hoverPreviewHideDelayMs,
					});
				}),
			);

		new Setting(containerEl)
			.setName("Hover preview delay (ms)")
			.setDesc("Delay before opening hover preview.")
			.addSlider((slider) => {
				slider.setLimits(0, 3000, 50);
				slider.setValue(settings.hoverPreviewDelayMs);
				slider.setDynamicTooltip();
				slider.onChange((value) => {
					const current = this.plugin.getSettingsSnapshot();
					void this.plugin.updateHoverPreviewSettings({
						hoverPreviewEnabled: current.hoverPreviewEnabled,
						hoverPreviewDelayMs: value,
						hoverPreviewHideDelayMs: current.hoverPreviewHideDelayMs,
					});
				});
			});

		new Setting(containerEl)
			.setName("Unhover hide delay (ms)")
			.setDesc("Delay before hiding hover preview after leaving a monster name.")
			.addSlider((slider) => {
				slider.setLimits(0, 3000, 50);
				slider.setValue(settings.hoverPreviewHideDelayMs);
				slider.setDynamicTooltip();
				slider.onChange((value) => {
					const current = this.plugin.getSettingsSnapshot();
					void this.plugin.updateHoverPreviewSettings({
						hoverPreviewEnabled: current.hoverPreviewEnabled,
						hoverPreviewDelayMs: current.hoverPreviewDelayMs,
						hoverPreviewHideDelayMs: value,
					});
				});
			});

		new Setting(containerEl)
			.setName("Preview width (px)")
			.setDesc("Default width of the monster hover preview.")
			.addSlider((slider) => {
				slider.setLimits(320, 1400, 10);
				slider.setValue(settings.hoverPreviewWidthPx);
				slider.setDynamicTooltip();
				slider.onChange((value) => {
					const current = this.plugin.getSettingsSnapshot();
					void this.plugin.updateHoverPreviewLayoutSettings({
						hoverPreviewWidthPx: value,
						hoverPreviewWideColumns: current.hoverPreviewWideColumns,
					});
				});
			});

		new Setting(containerEl)
			.setName("Use wide preview (two-column)")
			.setDesc("Increase preview width to help fantasy statblocks render in two columns.")
			.addToggle((toggle) =>
				toggle.setValue(settings.hoverPreviewWideColumns).onChange((value) => {
					const current = this.plugin.getSettingsSnapshot();
					void this.plugin.updateHoverPreviewLayoutSettings({
						hoverPreviewWidthPx: current.hoverPreviewWidthPx,
						hoverPreviewWideColumns: value,
					});
				}),
			);

		new Setting(containerEl).setName("Dashboard hotkeys").setHeading();
		new Setting(containerEl)
			.setName("Enable dashboard hotkeys")
			.setDesc("Enable keyboard shortcuts while the dashboard is focused.")
			.addToggle((toggle) =>
				toggle.setValue(settings.dashboardHotkeysEnabled).onChange((value) => {
					void this.plugin.updateDashboardHotkeysEnabledSetting(value);
				}),
			);
		for (const field of DASHBOARD_HOTKEY_FIELDS) {
			this.addDashboardHotkeySetting(field.id, field.name, settings.dashboardHotkeys[field.id] ?? "");
		}
		new Setting(containerEl)
			.setName("Open current monster on next turn")
			.setDesc("Automatically open the active monster statblock whenever next turn is triggered.")
			.addToggle((toggle) =>
				toggle.setValue(settings.openCurrentMonsterOnNextTurn).onChange((value) => {
					void this.plugin.updateOpenCurrentMonsterOnNextTurnSetting(value);
				}),
			);

		new Setting(containerEl)
			.setName("Support encounter cast")
			.setDesc("If this plugin helps your game, you can support the author!")
			.addButton((button) =>
				button
					.setButtonText("Buy me a coffee")
					.setCta()
					.onClick(() => {
						window.open("https://buymeacoffee.com/zyon900", "_blank", "noopener,noreferrer");
					}),
			);
	}

	private addDashboardHotkeySetting(action: DashboardHotkeyAction, name: string, initialValue: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc("Click and press a shortcut. Press backspace, delete, or escape to clear.")
			.addText((text) => {
				text.setPlaceholder("Unbound");
				text.setValue(normalizeHotkey(initialValue));
				text.inputEl.readOnly = true;
				text.inputEl.addEventListener("focus", () => {
					text.inputEl.select();
				});
				text.inputEl.addEventListener("keydown", (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (event.key === "Backspace" || event.key === "Delete" || event.key === "Escape") {
						text.setValue("");
						void this.plugin.updateDashboardHotkeySetting(action, "");
						return;
					}
					const combo = hotkeyFromKeyboardEvent(event);
					if (!combo) {
						return;
					}
					text.setValue(combo);
					void this.plugin.updateDashboardHotkeySetting(action, combo);
				});
			});
	}

	private addNumberSetting(options: {
		name: string;
		desc: string;
		initialValue: number | null;
		placeholder: string;
		min: number;
		max: number;
		onSave: (value: number | null) => Promise<void>;
	}): void {
		new Setting(this.containerEl)
			.setName(options.name)
			.setDesc(options.desc)
			.addText((text) => {
				text.setPlaceholder(options.placeholder);
				text.setValue(options.initialValue === null ? "" : String(options.initialValue));

				const commit = () => {
					const raw = text.getValue().trim();
					const parsed = raw.length === 0 ? null : Number.parseInt(raw, 10);
					const nextValue = parsed === null || !Number.isFinite(parsed)
						? null
						: Math.min(options.max, Math.max(options.min, parsed));
					void options.onSave(nextValue).then(() => {
						text.setValue(nextValue === null ? "" : String(nextValue));
					});
				};

				text.inputEl.addEventListener("blur", commit);
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") {
						return;
					}
					event.preventDefault();
					text.inputEl.blur();
				});
			});
	}
}
