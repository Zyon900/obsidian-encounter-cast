/* This module runs in the standalone browser client, so browser fetch is expected here. */
/* eslint-disable no-restricted-globals */
import type {
	EndTurnPayload,
	InitiativeSubmitPayload,
	PlayerDeathSavesPayload,
	PlayerJoinRequest,
	PlayerUpdatePayload,
	StateSyncPayload,
} from "../player-events";

interface ApiResult {
	ok: boolean;
	error?: string;
}

interface PlayerJoinApiResult extends ApiResult {
	player?: {
		playerId: string;
	};
	state?: StateSyncPayload;
}

interface PlayerStateApiResult extends ApiResult {
	state?: StateSyncPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStateSyncPayload(value: unknown): value is StateSyncPayload {
	if (!isRecord(value) || !isRecord(value.playerState)) {
		return false;
	}
	return Array.isArray(value.playerState.combatants) && typeof value.playerState.round === "number";
}

function parseApiResult(value: unknown): ApiResult {
	if (!isRecord(value) || typeof value.ok !== "boolean") {
		return { ok: false, error: "Invalid API response." };
	}
	return {
		ok: value.ok,
		error: typeof value.error === "string" ? value.error : undefined,
	};
}

function parseJoinResult(value: unknown): PlayerJoinApiResult {
	const base = parseApiResult(value);
	if (!base.ok) {
		return base;
	}
	if (!isRecord(value)) {
		return { ok: false, error: "Invalid join response." };
	}
	const result: PlayerJoinApiResult = { ok: true };
	if (isRecord(value.player) && typeof value.player.playerId === "string") {
		result.player = { playerId: value.player.playerId };
	}
	if (isStateSyncPayload(value.state)) {
		result.state = value.state;
	}
	return result;
}

function parseStateResult(value: unknown): PlayerStateApiResult {
	const base = parseApiResult(value);
	if (!base.ok) {
		return base;
	}
	if (!isRecord(value)) {
		return { ok: false, error: "Invalid state response." };
	}
	return {
		ok: true,
		state: isStateSyncPayload(value.state) ? value.state : undefined,
	};
}

export class PlayerApiClient {
	constructor(private readonly token: string) {}

	private withToken(path: string): string {
		return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}`;
	}

	private async request(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
		const response = await fetch(this.withToken(path), {
			method,
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return await response.json();
	}

	async join(payload: PlayerJoinRequest): Promise<PlayerJoinApiResult> {
		return parseJoinResult(await this.request("/api/player/join", "POST", payload));
	}

	async refreshState(playerId: string): Promise<PlayerStateApiResult> {
		return parseStateResult(await this.request(`/api/player/state?playerId=${encodeURIComponent(playerId)}`, "GET"));
	}

	async submitInitiative(payload: InitiativeSubmitPayload): Promise<void> {
		await this.request("/api/player/initiative", "POST", payload);
	}

	async updatePlayer(payload: PlayerUpdatePayload): Promise<void> {
		await this.request("/api/player/update", "POST", payload);
	}

	async updateDeathSaves(payload: PlayerDeathSavesPayload): Promise<void> {
		await this.request("/api/player/death-saves", "POST", payload);
	}

	async endTurn(payload: EndTurnPayload): Promise<void> {
		await this.request("/api/player/end-turn", "POST", payload);
	}
}
