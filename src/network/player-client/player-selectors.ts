import type { StateSyncPayload } from "../player-events";

export type SheetMode = "none" | "edit" | "damage" | "death";
export type RollType = "nat1" | "normal" | "nat20";

export function parseIntOrNull(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed.length) {
		return null;
	}
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function sentenceCaseLabel(label: string): string {
	if (!label.length) {
		return label;
	}
	return label
		.split(" ")
		.map((part) => (part.length ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
		.join(" ");
}

export function hpClass(label: string): string {
	return `hp-label is-${label.split(" ").join("-")}`;
}

export function hpStateClass(label: string): string {
	return `sheet-player-health is-${label.split(" ").join("-")}`;
}

export function getSelfCombatant(state: StateSyncPayload | null) {
	return state?.playerState.combatants.find((combatant) => combatant.isSelf) ?? null;
}
