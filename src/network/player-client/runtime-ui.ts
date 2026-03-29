import { createEl, createIconSvg } from "./runtime-dom";

export function createInitiativeBadge(value: number | string, isCriticalFailure: boolean, isCriticalSuccess: boolean): HTMLSpanElement {
	const cls = `initiative${isCriticalFailure ? " is-crit-fail" : isCriticalSuccess ? " is-crit-success" : ""}`;
	const root = createEl("span", { className: cls });
	root.appendChild(createIconSvg("M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z"));
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createShield(value: number | string, isPlaceholder: boolean): HTMLSpanElement {
	const root = createEl("span", { className: `shield${isPlaceholder ? " placeholder" : ""}` });
	root.appendChild(createIconSvg("M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z"));
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createSheetShield(value: number | string): HTMLSpanElement {
	const root = createEl("span", { className: "sheet-summary-shield" });
	root.appendChild(createIconSvg("M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z"));
	root.appendChild(createEl("span", { text: String(value) }));
	return root;
}

export function createSheetHeart(): HTMLSpanElement {
	const heart = createEl("span", { className: "sheet-player-heart" });
	heart.appendChild(createIconSvg("M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z"));
	return heart;
}

export function createDeathSaveIndicator(successes: number, failures: number, className: string): HTMLDivElement {
	const root = createEl("div", { className: `death-save-indicator ${className}`.trim() });
	const clampedSuccesses = Math.max(0, Math.min(3, Math.trunc(successes)));
	const clampedFailures = Math.max(0, Math.min(3, Math.trunc(failures)));

	const createRow = (type: "success" | "failure", filled: number): HTMLDivElement => {
		const row = createEl("div", { className: `death-save-row is-${type}` });
		const icon = createEl("span", { className: "death-save-icon" });
		icon.appendChild(
			createIconSvg(
				type === "failure"
					? "M16 4C10.5 4 6 8.5 6 14v3.5c0 2.6 1.8 4.8 4.2 5.4V28h2.8v-2h6v2h2.8v-5.1c2.4-.6 4.2-2.8 4.2-5.4V14c0-5.5-4.5-10-10-10ZM12.2 13.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm7.6 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM13 20.2h6"
					: "M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z",
			),
		);
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
