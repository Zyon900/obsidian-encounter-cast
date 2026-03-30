import { useMemo } from "preact/hooks";
import type { StateSyncPayload } from "../../player-contracts";
import { getSelfCombatant } from "../player-selectors";
import { createEmptyStateSyncPayload } from "../state/player-defaults";

interface DerivedPlayerState {
	stateSync: StateSyncPayload;
	self: ReturnType<typeof getSelfCombatant>;
	isYourTurn: boolean;
	isDowned: boolean;
	needsInitiative: boolean;
}

export function useDerivedPlayerState(stateSyncValue: StateSyncPayload | null): DerivedPlayerState {
	return useMemo(() => {
		const stateSync = stateSyncValue ?? createEmptyStateSyncPayload();
		const self = getSelfCombatant(stateSyncValue);
		const isYourTurn = Boolean(self && stateSync.playerState.encounterRunning && self.id === stateSync.playerState.activeCombatantId);
		const isDowned = Boolean(self && self.deathState === "down");
		const needsInitiative = Boolean(self && stateSync.playerState.encounterRunning && self.initiative === null);
		return { stateSync, self, isYourTurn, isDowned, needsInitiative };
	}, [stateSyncValue]);
}
