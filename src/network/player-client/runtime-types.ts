import type { InitiativeSubmitPayload, PlayerFacingState, StateSyncPayload } from "../player-events";

export type RollType = NonNullable<InitiativeSubmitPayload["rollType"]>;
export type SheetMode = "none" | "edit" | "damage" | "death";
export type PlayerCombatant = PlayerFacingState["combatants"][number];

export interface ApiResult {
	ok: boolean;
	error?: string;
}

export interface PlayerJoinApiResult extends ApiResult {
	player?: {
		playerId: string;
	};
	state?: StateSyncPayload;
}

export interface PlayerStateApiResult extends ApiResult {
	state?: StateSyncPayload;
}
