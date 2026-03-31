import { DEFAULT_DASHBOARD_HOTKEYS, normalizeHotkey, type DashboardHotkeyAction, type DashboardHotkeyBindings } from "../ui/dashboard/hotkeys";
import type { EncounterPartySettings } from "../encounter/codeblock-difficulty";

export interface EncounterCastSettings extends EncounterPartySettings {
	rollMonsterHp: boolean;
	rollAllDiceOnMonsterInfoOpen: boolean;
	dashboardHotkeysEnabled: boolean;
	dashboardHotkeys: DashboardHotkeyBindings;
	openCurrentMonsterOnNextTurn: boolean;
	hoverPreviewEnabled: boolean;
	hoverPreviewDelayMs: number;
	hoverPreviewHideDelayMs: number;
	hoverPreviewWidthPx: number;
	hoverPreviewWideColumns: boolean;
}

export const DEFAULT_SETTINGS: EncounterCastSettings = {
	partyMembers: null,
	partyLevel: null,
	rollMonsterHp: false,
	rollAllDiceOnMonsterInfoOpen: false,
	dashboardHotkeysEnabled: false,
	dashboardHotkeys: DEFAULT_DASHBOARD_HOTKEYS,
	openCurrentMonsterOnNextTurn: false,
	hoverPreviewEnabled: true,
	hoverPreviewDelayMs: 500,
	hoverPreviewHideDelayMs: 500,
	hoverPreviewWidthPx: 460,
	hoverPreviewWideColumns: false,
};

export function mergeSettings(value: unknown): EncounterCastSettings {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_SETTINGS };
	}

	const candidate = value as Partial<EncounterCastSettings>;
	return {
		partyMembers: Number.isInteger(candidate.partyMembers) ? candidate.partyMembers ?? null : null,
		partyLevel: Number.isInteger(candidate.partyLevel) ? candidate.partyLevel ?? null : null,
		rollMonsterHp: typeof candidate.rollMonsterHp === "boolean" ? candidate.rollMonsterHp : DEFAULT_SETTINGS.rollMonsterHp,
		rollAllDiceOnMonsterInfoOpen:
			typeof candidate.rollAllDiceOnMonsterInfoOpen === "boolean"
				? candidate.rollAllDiceOnMonsterInfoOpen
				: DEFAULT_SETTINGS.rollAllDiceOnMonsterInfoOpen,
		dashboardHotkeysEnabled:
			typeof candidate.dashboardHotkeysEnabled === "boolean"
				? candidate.dashboardHotkeysEnabled
				: DEFAULT_SETTINGS.dashboardHotkeysEnabled,
		dashboardHotkeys: mergeDashboardHotkeys(candidate.dashboardHotkeys),
		openCurrentMonsterOnNextTurn:
			typeof candidate.openCurrentMonsterOnNextTurn === "boolean"
				? candidate.openCurrentMonsterOnNextTurn
				: DEFAULT_SETTINGS.openCurrentMonsterOnNextTurn,
		hoverPreviewEnabled:
			typeof candidate.hoverPreviewEnabled === "boolean"
				? candidate.hoverPreviewEnabled
				: DEFAULT_SETTINGS.hoverPreviewEnabled,
		hoverPreviewDelayMs: normalizeHoverDelay(candidate.hoverPreviewDelayMs, DEFAULT_SETTINGS.hoverPreviewDelayMs),
		hoverPreviewHideDelayMs: normalizeHoverDelay(
			candidate.hoverPreviewHideDelayMs,
			DEFAULT_SETTINGS.hoverPreviewHideDelayMs,
		),
		hoverPreviewWidthPx: normalizeHoverWidth(candidate.hoverPreviewWidthPx, DEFAULT_SETTINGS.hoverPreviewWidthPx),
		hoverPreviewWideColumns:
			typeof candidate.hoverPreviewWideColumns === "boolean"
				? candidate.hoverPreviewWideColumns
				: DEFAULT_SETTINGS.hoverPreviewWideColumns,
	};
}

export function normalizeHoverDelay(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	return Math.min(3000, Math.max(0, rounded));
}

export function normalizeHoverWidth(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	return Math.min(1400, Math.max(320, rounded));
}

export function mergeDashboardHotkeys(value: unknown): DashboardHotkeyBindings {
	if (!value || typeof value !== "object") {
		return { ...DEFAULT_DASHBOARD_HOTKEYS };
	}

	const candidate = value as Partial<Record<DashboardHotkeyAction, unknown>>;
	const merged = { ...DEFAULT_DASHBOARD_HOTKEYS };
	for (const action of Object.keys(DEFAULT_DASHBOARD_HOTKEYS) as DashboardHotkeyAction[]) {
		const raw = candidate[action];
		if (typeof raw !== "string") {
			continue;
		}
		merged[action] = normalizeHotkey(raw);
	}
	return merged;
}
