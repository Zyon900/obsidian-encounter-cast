import type { CombatSession } from "../encounter/combat-session";

export type PlayerId = string;
export type CombatantId = string;

export interface PlayerTheme {
	backgroundPrimary: string;
	backgroundSecondary: string;
	textNormal: string;
	textMuted: string;
	textError: string;
	textSuccess: string;
	textWarning: string;
	textFaint: string;
	interactiveAccent: string;
	textOnAccent: string;
	border: string;
}

export interface PlayerPresenceState {
	playerId: PlayerId;
	name: string;
	combatantId: CombatantId;
	online: boolean;
	lastSeenAt: string;
}

export interface PlayerJoinRequest {
	name: string;
	playerId?: PlayerId;
}

export interface PlayerJoinResponse {
	playerId: PlayerId;
	combatantId: CombatantId;
	name: string;
}

export interface InitiativeSubmitPayload {
	playerId: PlayerId;
	initiativeTotal: number;
	rollType?: "nat1" | "normal" | "nat20";
}

export interface PlayerUpdatePayload {
	playerId: PlayerId;
	hpCurrent?: number | null;
	hpMax?: number | null;
	tempHp?: number;
	ac?: number | null;
}

export interface EndTurnPayload {
	playerId: PlayerId;
}

export interface PlayerFacingState {
	encounterRunning: boolean;
	round: number;
	activeCombatantId: CombatantId | null;
	combatants: Array<{
		id: CombatantId;
		name: string;
		isPlayer: boolean;
		initiative: number | null;
		initiativeRoll: number | null;
		initiativeCriticalFailure: boolean;
		hpLabel: "unscathed" | "healthy" | "hurt" | "critically wounded" | "down" | "dead";
		isSelf: boolean;
		hpCurrent: number | null;
		hpMax: number | null;
		tempHp: number;
		ac: number | null;
	}>;
	players: PlayerPresenceState[];
	theme: PlayerTheme | null;
	sessionId: string | null;
}

export interface StateSyncPayload {
	playerState: PlayerFacingState;
	session: CombatSession | null;
}
