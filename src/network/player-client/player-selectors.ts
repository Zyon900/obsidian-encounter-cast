import type { StateSyncPayload } from "../player-contracts";

export function getSelfCombatant(state: StateSyncPayload | null) {
	return state?.playerState.combatants.find((combatant) => combatant.isSelf) ?? null;
}
