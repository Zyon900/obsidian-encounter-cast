import type { StateSyncPayload } from "../player-events";
import type { ApiResult, PlayerJoinApiResult, PlayerStateApiResult } from "./runtime-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isApiResult(value: unknown): value is ApiResult {
	return isRecord(value) && typeof value.ok === "boolean";
}

export function isStateSyncPayload(value: unknown): value is StateSyncPayload {
	if (!isRecord(value) || !isRecord(value.playerState)) {
		return false;
	}
	const playerState = value.playerState;
	return Array.isArray(playerState.combatants) && typeof playerState.round === "number";
}

export function asPlayerJoinResult(value: unknown): PlayerJoinApiResult {
	if (!isApiResult(value)) {
		return { ok: false, error: "Invalid join response." };
	}
	const data = value as unknown as Record<string, unknown>;
	const result: PlayerJoinApiResult = { ok: value.ok };
	if (typeof data.error === "string") {
		result.error = data.error;
	}
	if (isRecord(data.player) && typeof data.player.playerId === "string") {
		result.player = { playerId: data.player.playerId };
	}
	if (isStateSyncPayload(data.state)) {
		result.state = data.state;
	}
	return result;
}

export function asPlayerStateResult(value: unknown): PlayerStateApiResult {
	if (!isApiResult(value)) {
		return { ok: false, error: "Invalid state response." };
	}
	const data = value as unknown as Record<string, unknown>;
	const result: PlayerStateApiResult = { ok: value.ok };
	if (typeof data.error === "string") {
		result.error = data.error;
	}
	if (isStateSyncPayload(data.state)) {
		result.state = data.state;
	}
	return result;
}

export function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}
