import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlayerId } from "../player-contracts";

export class PlayerSseManager {
	private readonly clients = new Map<PlayerId, Set<ServerResponse>>();

	openStream(req: IncomingMessage, res: ServerResponse, playerId: PlayerId, initialPayload: unknown): void {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.write("retry: 2000\n\n");

		const group = this.clients.get(playerId) ?? new Set<ServerResponse>();
		group.add(res);
		this.clients.set(playerId, group);
		this.send(res, "state_sync", initialPayload);

		req.on("close", () => {
			const current = this.clients.get(playerId);
			if (!current) {
				return;
			}
			current.delete(res);
			if (current.size === 0) {
				this.clients.delete(playerId);
			}
		});
	}

	broadcastState(buildPayload: (playerId: PlayerId) => unknown): void {
		if (this.clients.size === 0) {
			return;
		}

		for (const [playerId, streams] of this.clients) {
			const payload = buildPayload(playerId);
			for (const stream of streams) {
				this.send(stream, "state_sync", payload);
			}
		}
	}

	emitServerShutdown(): void {
		if (this.clients.size === 0) {
			return;
		}

		for (const streams of this.clients.values()) {
			for (const stream of streams) {
				this.send(stream, "server_shutdown", { ok: true, message: "Encounter server has shut down." });
			}
		}
	}

	kickPlayer(playerId: PlayerId): void {
		const streams = this.clients.get(playerId);
		if (!streams) {
			return;
		}

		for (const stream of streams) {
			this.send(stream, "player_kicked", { ok: true, message: "You were removed from this encounter." });
			stream.end();
		}
		this.clients.delete(playerId);
	}

	closeAll(): void {
		for (const streams of this.clients.values()) {
			for (const stream of streams) {
				stream.end();
			}
		}
		this.clients.clear();
	}

	private send(res: ServerResponse, eventName: string, payload: unknown): void {
		res.write(`event: ${eventName}\n`);
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
	}
}
