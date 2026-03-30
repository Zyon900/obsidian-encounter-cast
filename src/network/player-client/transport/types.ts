import type { StateSyncPayload } from "../../player-contracts";

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

export interface PlayerStreamHandlers {
	onStateSync: (state: StateSyncPayload) => void;
	onServerShutdown: (message: string) => void;
	onPlayerKicked: (message: string) => void;
	onDisconnected: () => void;
}
