import { PluginSettingTab, Setting, type App } from "obsidian";
import EncounterCastPlugin from "../../main";

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
