import type { StateSyncPayload } from "../player-contracts";
import type { RollType, SheetMode } from "./player-types";

export type TopView = "join" | "qr" | "app" | "shutdown" | "kicked";

export interface PlayerUiState {
	topView: TopView;
	playerId: string;
	stateSync: StateSyncPayload | null;
	sheetMode: SheetMode;
	initiativeRollType: RollType;
	deathDraftFailures: number;
	deathDraftSuccesses: number;
	serverShutDown: boolean;
	joinMessage: string;
	shutdownMessage: string;
	kickedMessage: string;
}

export type PlayerUiAction =
	| { type: "SET_TOP_VIEW"; value: TopView }
	| { type: "SET_PLAYER_ID"; value: string }
	| { type: "SET_STATE_SYNC"; value: StateSyncPayload | null }
	| { type: "SET_SHEET_MODE"; value: SheetMode }
	| { type: "SET_INITIATIVE_ROLL_TYPE"; value: RollType }
	| { type: "SET_DEATH_DRAFT"; failures: number; successes: number }
	| { type: "SET_JOIN_MESSAGE"; value: string }
	| { type: "SERVER_SHUTDOWN"; value: string }
	| { type: "PLAYER_KICKED"; value: string };

export function createInitialUiState(initialPlayerId: string): PlayerUiState {
	return {
		topView: initialPlayerId ? "app" : "join",
		playerId: initialPlayerId,
		stateSync: null,
		sheetMode: "none",
		initiativeRollType: "normal",
		deathDraftFailures: 0,
		deathDraftSuccesses: 0,
		serverShutDown: false,
		joinMessage: "",
		shutdownMessage: "",
		kickedMessage: "",
	};
}

export function playerUiReducer(state: PlayerUiState, action: PlayerUiAction): PlayerUiState {
	switch (action.type) {
		case "SET_TOP_VIEW":
			return { ...state, topView: action.value };
		case "SET_PLAYER_ID":
			return { ...state, playerId: action.value };
		case "SET_STATE_SYNC":
			return { ...state, stateSync: action.value };
		case "SET_SHEET_MODE":
			return { ...state, sheetMode: action.value };
		case "SET_INITIATIVE_ROLL_TYPE":
			return { ...state, initiativeRollType: action.value };
		case "SET_DEATH_DRAFT":
			return {
				...state,
				deathDraftFailures: action.failures,
				deathDraftSuccesses: action.successes,
			};
		case "SET_JOIN_MESSAGE":
			return { ...state, joinMessage: action.value };
		case "SERVER_SHUTDOWN":
			return {
				...state,
				serverShutDown: true,
				shutdownMessage: action.value,
				topView: "shutdown",
			};
		case "PLAYER_KICKED":
			return {
				...state,
				playerId: "",
				kickedMessage: action.value,
				topView: "kicked",
			};
		default:
			return state;
	}
}
