export type DashboardHotkeyAction =
	| "nextTurn"
	| "damageHeal"
	| "kick"
	| "setActive"
	| "moveSelectionUp"
	| "moveSelectionDown"
	| "remove"
	| "openMonsterInfo";

export type DashboardHotkeyBindings = Record<DashboardHotkeyAction, string>;

export const DEFAULT_DASHBOARD_HOTKEYS: DashboardHotkeyBindings = {
	nextTurn: "E",
	damageHeal: "D",
	kick: "",
	setActive: "F",
	moveSelectionUp: "W",
	moveSelectionDown: "S",
	remove: "R",
	openMonsterInfo: "A",
};

export const DASHBOARD_HOTKEY_FIELDS: Array<{ id: DashboardHotkeyAction; name: string }> = [
	{ id: "nextTurn", name: "Next turn" },
	{ id: "damageHeal", name: "Damage / heal" },
	{ id: "kick", name: "Kick player" },
	{ id: "setActive", name: "Set active" },
	{ id: "moveSelectionUp", name: "Move selection up" },
	{ id: "moveSelectionDown", name: "Move selection down" },
	{ id: "remove", name: "Remove" },
	{ id: "openMonsterInfo", name: "Open monster info" },
];

export function normalizeHotkey(value: string): string {
	const trimmed = value.trim();
	if (!trimmed.length) {
		return "";
	}

	const normalized = trimmed
		.split("+")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.map((part) => normalizeHotkeyToken(part));
	return normalized.join("+");
}

export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
	const key = normalizeEventKey(event.key);
	if (!key || key === "Shift" || key === "Alt" || key === "Meta" || key === "Control") {
		return null;
	}

	const modifiers: string[] = [];
	if (event.metaKey || event.ctrlKey) {
		modifiers.push("Mod");
	}
	if (event.altKey) {
		modifiers.push("Alt");
	}
	if (event.shiftKey && key.length > 1) {
		modifiers.push("Shift");
	}

	return modifiers.concat(key).join("+");
}

function normalizeHotkeyToken(token: string): string {
	switch (token.toLowerCase()) {
		case "cmd":
		case "command":
		case "ctrl":
		case "control":
		case "meta":
		case "mod":
			return "Mod";
		case "alt":
		case "option":
			return "Alt";
		case "shift":
			return "Shift";
		default:
			return normalizeEventKey(token);
	}
}

function normalizeEventKey(raw: string): string {
	if (!raw) {
		return "";
	}

	if (raw.length === 1) {
		return raw.toUpperCase();
	}

	switch (raw) {
		case " ":
		case "Spacebar":
			return "Space";
		case "Esc":
			return "Escape";
		default:
			return raw;
	}
}
