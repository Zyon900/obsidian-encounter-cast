import type { StateSyncPayload } from "../../player-contracts";

export function createEmptyStateSyncPayload(): StateSyncPayload {
	return {
		session: null,
		playerState: {
			encounterRunning: false,
			round: 1,
			activeCombatantId: null,
			combatants: [],
			players: [],
			theme: null,
			sessionId: null,
		},
	};
}
