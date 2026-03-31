import type { CombatSession } from "./combat-session";

export function getPlayerCombatants(session: CombatSession | null): CombatSession["combatants"] {
	if (!session) {
		return [];
	}
	return session.combatants.filter((combatant) => combatant.isPlayer === true);
}

export function preparePlayerCombatantsForCombatStart(
	combatants: CombatSession["combatants"],
): CombatSession["combatants"] {
	return combatants.map((combatant) => ({
		...combatant,
		initiative: null,
		initiativeRoll: null,
		initiativeCriticalFailure: false,
	}));
}

export function clearPlayerInitiatives(session: CombatSession): CombatSession {
	return {
		...session,
		combatants: session.combatants.map((combatant) =>
			combatant.isPlayer === true
				? {
						...combatant,
						initiative: null,
						initiativeRoll: null,
						initiativeCriticalFailure: false,
					}
				: combatant,
		),
		updatedAt: new Date().toISOString(),
	};
}
