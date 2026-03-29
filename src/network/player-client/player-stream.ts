import type { StateSyncPayload } from "../player-events";

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
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

export interface PlayerStreamHandlers {
	onStateSync: (state: StateSyncPayload) => void;
	onServerShutdown: (message: string) => void;
	onPlayerKicked: (message: string) => void;
	onDisconnected: () => void;
}

export function createPlayerEventStream(
	token: string,
	playerId: string,
	handlers: PlayerStreamHandlers,
): EventSource {
	const url = `/api/player/stream?playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`;
	const stream = new EventSource(url);
	stream.addEventListener("state_sync", (event: MessageEvent<string>) => {
		const parsed = parseJson(event.data);
		if (isStateSyncPayload(parsed)) {
			handlers.onStateSync(parsed);
		}
	});
	stream.addEventListener("server_shutdown", (event: MessageEvent<string>) => {
		const parsed = parseJson(event.data);
		if (isRecord(parsed) && typeof parsed.message === "string") {
			handlers.onServerShutdown(parsed.message);
			return;
		}
		handlers.onServerShutdown("Encounter server has shut down.");
	});
	stream.addEventListener("player_kicked", (event: MessageEvent<string>) => {
		const parsed = parseJson(event.data);
		if (isRecord(parsed) && typeof parsed.message === "string") {
			handlers.onPlayerKicked(parsed.message);
			return;
		}
		handlers.onPlayerKicked("You were removed from this encounter.");
	});
	stream.onerror = () => {
		handlers.onDisconnected();
	};
	return stream;
}
