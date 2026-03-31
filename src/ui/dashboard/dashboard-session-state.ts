import type { CombatSession } from "../../encounter/combat-session";

export function clearMonstersFromSessionState(
	session: CombatSession,
	encounterRunning: boolean,
): {
	session: CombatSession;
	monsterCount: number;
	encounterRunning: boolean;
} {
	const monsterCount = session.combatants.filter((combatant) => combatant.isPlayer !== true).length;
	const playerCombatants = session.combatants.filter((combatant) => combatant.isPlayer === true);
	const activeId = session.combatants[session.activeIndex]?.id ?? null;
	const activeIndex = activeId ? playerCombatants.findIndex((combatant) => combatant.id === activeId) : -1;
	const nextEncounterRunning = encounterRunning && playerCombatants.length > 0;

	return {
		monsterCount,
		encounterRunning: nextEncounterRunning,
		session: {
			...session,
			combatants: playerCombatants,
			activeIndex: activeIndex >= 0 ? activeIndex : 0,
			round: playerCombatants.length > 0 ? session.round : 1,
			updatedAt: new Date().toISOString(),
		},
	};
}

export function duplicateSelectedMonsters(
	session: CombatSession,
	combatantIds: string[],
): { session: CombatSession; duplicateCount: number } {
	const selected = new Set(combatantIds);
	if (selected.size === 0) {
		return { session, duplicateCount: 0 };
	}

	let duplicateCount = 0;
	const nextCombatants: CombatSession["combatants"] = [];
	for (const combatant of session.combatants) {
		nextCombatants.push(combatant);
		if (!selected.has(combatant.id) || combatant.isPlayer === true) {
			continue;
		}

		duplicateCount += 1;
		nextCombatants.push({
			...combatant,
			id: `combatant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			name: `${combatant.name} copy`,
		});
	}

	return {
		duplicateCount,
		session: {
			...session,
			combatants: nextCombatants,
			updatedAt: new Date().toISOString(),
		},
	};
}

export function parseIntegerInput(value: string): number | null | undefined {
	const trimmed = value.trim();
	if (!trimmed.length) {
		return null;
	}

	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}
