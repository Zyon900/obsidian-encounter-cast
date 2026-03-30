import type { SheetMode } from "../player-types";

export function isPanelOpen(sheetMode: SheetMode, panel: Exclude<SheetMode, "none">): boolean {
	return sheetMode === panel;
}

export function isSheetSummaryHidden(sheetMode: SheetMode): boolean {
	return sheetMode === "edit";
}

export function isSheetActionsHidden(sheetMode: SheetMode): boolean {
	return sheetMode === "death";
}

export function isDeathSaveCtaVisible(isDowned: boolean, sheetMode: SheetMode): boolean {
	return isDowned && sheetMode !== "death" && sheetMode !== "edit" && sheetMode !== "damage";
}

export function isTurnCtaVisible(isYourTurn: boolean): boolean {
	return isYourTurn;
}

export function isDeathConfirmVisible(value: number): boolean {
	return value >= 3;
}

export function isInitiativeGateOpen(needsInitiative: boolean): boolean {
	return needsInitiative;
}

export function combatantRowClass(options: {
	isActive: boolean;
	isSelf: boolean;
	isYourTurn: boolean;
}): string {
	const { isActive, isSelf, isYourTurn } = options;
	return `combatant${isActive ? " active" : ""}${isSelf ? " is-self" : ""}${isYourTurn ? " is-your-turn" : ""}`;
}

export function initiativeClass(options: {
	initiativeCriticalFailure?: boolean | null;
	initiativeRoll?: number | null;
}): string {
	if (options.initiativeCriticalFailure) {
		return "initiative is-crit-fail";
	}
	if (options.initiativeRoll === 20) {
		return "initiative is-crit-success";
	}
	return "initiative";
}
