import {
	createEl,
	createHeartSvg,
	createHexIconSvg,
	createShieldSvg,
	createSkullSvg,
} from "./runtime-dom";

export function createInitiativeBadge(value: number | string, isCriticalFailure: boolean, isCriticalSuccess: boolean): HTMLSpanElement {
	const cls = `initiative${isCriticalFailure ? " is-crit-fail" : isCriticalSuccess ? " is-crit-success" : ""}`;
	const root = createEl("span", { className: cls });
	root.appendChild(createHexIconSvg());
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createShield(value: number | string, isPlaceholder: boolean): HTMLSpanElement {
	const root = createEl("span", { className: `shield${isPlaceholder ? " placeholder" : ""}` });
	root.appendChild(createShieldSvg());
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createSheetShield(value: number | string): HTMLSpanElement {
	const root = createEl("span", { className: "sheet-summary-shield" });
	root.appendChild(createShieldSvg());
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createSheetHeart(): HTMLSpanElement {
	const heart = createEl("span", { className: "sheet-player-heart" });
	heart.appendChild(createHeartSvg());
	return heart;
}

export function createDeathSaveIndicator(successes: number, failures: number, className: string): HTMLDivElement {
	const root = createEl("div", { className: `death-save-indicator ${className}`.trim() });
	const clampedSuccesses = Math.max(0, Math.min(3, Math.trunc(successes)));
	const clampedFailures = Math.max(0, Math.min(3, Math.trunc(failures)));

	const createRow = (type: "success" | "failure", filled: number): HTMLDivElement => {
		const row = createEl("div", { className: `death-save-row is-${type}` });
		const icon = createEl("span", { className: "death-save-icon" });
		icon.appendChild(type === "failure" ? createSkullSvg() : createHeartSvg());
		row.appendChild(icon);
		for (let index = 0; index < 3; index++) {
			const isFilled = index < filled;
			row.appendChild(
				createEl("span", {
					className: `death-save-diamond${isFilled ? " is-filled" : ""}`,
					text: isFilled ? "◆" : "◇",
				}),
			);
		}
		return row;
	};

	root.appendChild(createRow("failure", clampedFailures));
	root.appendChild(createRow("success", clampedSuccesses));
	return root;
}
