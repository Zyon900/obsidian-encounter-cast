import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { createCombatSession, upsertPlayerCombatant, type CombatSession } from "../encounter/combat-session";
import type {
	EndTurnPayload,
	InitiativeSubmitPayload,
	PlayerDeathSavesPayload,
	PlayerId,
	PlayerJoinRequest,
	PlayerJoinResponse,
	PlayerPresenceState,
	PlayerTheme,
	PlayerUpdatePayload,
	StateSyncPayload,
} from "./player-contracts";
import {
	applySecurityHeaders,
	buildInviteUrls,
	isAuthorizedRequest,
	readJsonBody,
	readPathname,
	readQuery,
	resolveInviteUrl,
	sendHtml,
	sendJavascript,
	sendJson,
	sendSvg,
} from "./server/http-helpers";
import {
	applyEndTurn,
	applyInitiativeSubmit,
	applyPlayerDeathSaves,
	applyPlayerUpdate,
	findPlayerCombatant,
	removeCombatantFromSession,
	resolvePlayerCombatantId,
} from "./server/session-mutators";
import { PlayerSseManager } from "./server/sse-manager";
import { renderInviteQrSvg } from "./server/player/invite-qr";
import { buildPlayerViewState } from "./server/player/player-view-state";
import { renderPlayerPageHtml } from "./server/player/render-player-page";

export interface CombatServerState {
	running: boolean;
	port: number | null;
	roomToken: string | null;
	inviteUrls: string[];
}

export class CombatServer {
	private httpServer: HttpServer | null = null;
	private state: CombatServerState = {
		running: false,
		port: null,
		roomToken: null,
		inviteUrls: [],
	};
	private activeSession: CombatSession | null = null;
	private encounterRunning = false;
	private theme: PlayerTheme | null = null;
	private supportUrl: string | null = null;
	private playerClientScript: string | null = null;
	private assetRootDir = ".";
	private readonly players = new Map<PlayerId, PlayerPresenceState>();
	private readonly sse = new PlayerSseManager();
	private onSessionChange: ((session: CombatSession | null) => void) | null = null;

	getState(): CombatServerState {
		return {
			...this.state,
			inviteUrls: [...this.state.inviteUrls],
		};
	}

	async start(port = 0): Promise<CombatServerState> {
		if (this.httpServer) {
			return this.getState();
		}

		const token = randomBytes(16).toString("hex");
		const httpServer = createServer((req, res) => {
			void this.handleRequest(req, res, token);
		});

		await new Promise<void>((resolve, reject) => {
			httpServer.once("error", reject);
			httpServer.listen(port, "0.0.0.0", () => resolve());
		});

		const address = httpServer.address();
		const actualPort = typeof address === "object" && address ? address.port : null;

		this.httpServer = httpServer;
		this.state = {
			running: true,
			port: actualPort,
			roomToken: token,
			inviteUrls: actualPort === null ? [] : buildInviteUrls(actualPort, token),
		};

		return this.getState();
	}

	async stop(): Promise<void> {
		this.sse.emitServerShutdown();
		this.sse.closeAll();

		if (this.httpServer) {
			const httpServer = this.httpServer;
			await new Promise<void>((resolve) => httpServer.close(() => resolve()));
			this.httpServer = null;
		}

		this.players.clear();
		this.state = {
			running: false,
			port: null,
			roomToken: null,
			inviteUrls: [],
		};
	}

	setSession(session: CombatSession | null): void {
		if (!session) {
			this.activeSession = null;
			this.emitStateSyncToAllPlayers();
			return;
		}

		let next = session;
		for (const player of this.players.values()) {
			next = upsertPlayerCombatant(next, player.playerId, player.name);
			const combatant = findPlayerCombatant(next, player.playerId);
			if (combatant) {
				player.combatantId = combatant.id;
			}
		}

		this.activeSession = next;
		this.emitStateSyncToAllPlayers();
	}

	setEncounterRunning(encounterRunning: boolean): void {
		this.encounterRunning = encounterRunning;
		this.emitStateSyncToAllPlayers();
	}

	setTheme(theme: PlayerTheme | null): void {
		this.theme = theme;
		this.emitStateSyncToAllPlayers();
	}

	setSupportUrl(url: string | null): void {
		this.supportUrl = url;
	}

	setAssetRootDir(dir: string): void {
		this.assetRootDir = dir;
		this.playerClientScript = null;
	}

	setOnSessionChange(callback: ((session: CombatSession | null) => void) | null): void {
		this.onSessionChange = callback;
	}

	kickPlayerByCombatantId(combatantId: string): boolean {
		const player = Array.from(this.players.values()).find((candidate) => candidate.combatantId === combatantId) ?? null;
		if (!player) {
			return false;
		}
		return this.kickPlayer(player.playerId);
	}

	kickPlayer(playerId: string): boolean {
		const player = this.players.get(playerId);
		if (!player) {
			return false;
		}

		this.sse.kickPlayer(playerId);
		this.players.delete(playerId);
		if (this.activeSession) {
			this.activeSession = removeCombatantFromSession(this.activeSession, player.combatantId);
		}

		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);
		return true;
	}

	private async handleRequest(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
		try {
			applySecurityHeaders(res);
			const pathname = readPathname(req.url);
			const method = req.method ?? "GET";

			if (pathname === "/health") {
				sendJson(res, 200, { ok: true });
				return;
			}
			if (pathname === "/favicon.ico") {
				res.statusCode = 204;
				res.end();
				return;
			}
			if (pathname === "/player-client.js" && method === "GET") {
				const script = await this.loadPlayerClientScript();
				sendJavascript(res, 200, script);
				return;
			}

			if (!isAuthorizedRequest(req, token)) {
				sendJson(res, 401, { ok: false, error: "Invalid or missing room token." });
				return;
			}

			if (pathname === "/" && method === "GET") {
				sendHtml(res, 200, renderPlayerPageHtml(this.theme, this.supportUrl));
				return;
			}
			if (pathname === "/api/session" && method === "GET") {
				sendJson(res, 200, {
					ok: true,
					session: this.activeSession,
					running: this.encounterRunning,
				});
				return;
			}
			if (pathname === "/api/invite-qr" && method === "GET") {
				const inviteUrl = resolveInviteUrl(req, token, this.state.inviteUrls);
				const svg = await renderInviteQrSvg(inviteUrl);
				sendSvg(res, 200, svg);
				return;
			}

			if (pathname === "/api/player/state" && method === "GET") {
				const queryPlayerId = readQuery(req.url).get("playerId") ?? "";
				if (!queryPlayerId || !this.players.has(queryPlayerId)) {
					sendJson(res, 400, { ok: false, error: "Unknown playerId." });
					return;
				}
				sendJson(res, 200, { ok: true, state: this.buildStateSync(queryPlayerId) });
				return;
			}
			if (pathname === "/api/player/stream" && method === "GET") {
				const queryPlayerId = readQuery(req.url).get("playerId") ?? "";
				if (!queryPlayerId || !this.players.has(queryPlayerId)) {
					sendJson(res, 400, { ok: false, error: "Unknown playerId." });
					return;
				}
				this.sse.openStream(req, res, queryPlayerId, this.buildStateSync(queryPlayerId));
				return;
			}
			if (pathname === "/api/player/join" && method === "POST") {
				const payload = await readJsonBody<PlayerJoinRequest>(req);
				const result = this.handlePlayerJoin(payload);
				sendJson(res, 200, {
					ok: true,
					player: result,
					state: this.buildStateSync(result.playerId),
				});
				return;
			}
			if (pathname === "/api/player/leave" && method === "POST") {
				const payload = await readJsonBody<{ playerId: string }>(req);
				this.handlePlayerLeave(payload.playerId);
				sendJson(res, 200, { ok: true });
				return;
			}
			if (pathname === "/api/player/initiative" && method === "POST") {
				const payload = await readJsonBody<InitiativeSubmitPayload>(req);
				const changed = this.handleInitiativeSubmit(payload);
				sendJson(res, 200, { ok: changed, state: this.buildStateSync(payload.playerId) });
				return;
			}
			if (pathname === "/api/player/update" && method === "POST") {
				const payload = await readJsonBody<PlayerUpdatePayload>(req);
				const changed = this.handlePlayerUpdate(payload);
				sendJson(res, 200, { ok: changed, state: this.buildStateSync(payload.playerId) });
				return;
			}
			if (pathname === "/api/player/death-saves" && method === "POST") {
				const payload = await readJsonBody<PlayerDeathSavesPayload>(req);
				const changed = this.handlePlayerDeathSaves(payload);
				sendJson(res, 200, { ok: changed, state: this.buildStateSync(payload.playerId) });
				return;
			}
			if (pathname === "/api/player/end-turn" && method === "POST") {
				const payload = await readJsonBody<EndTurnPayload>(req);
				const changed = this.handleEndTurn(payload);
				sendJson(res, 200, { ok: changed, state: this.buildStateSync(payload.playerId) });
				return;
			}

			sendJson(res, 404, { ok: false, error: "Not found." });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Request failed.";
			sendJson(res, 400, { ok: false, error: message });
		}
	}

	private handlePlayerJoin(payload: PlayerJoinRequest): PlayerJoinResponse {
		const name = (payload.name ?? "").trim();
		if (!name.length) {
			throw new Error("Player name is required.");
		}

		const playerId = payload.playerId?.trim() || `player-${randomBytes(8).toString("hex")}`;
		const now = new Date().toISOString();
		if (!this.activeSession) {
			this.activeSession = createCombatSession("Current encounter", []);
		}

		this.activeSession = upsertPlayerCombatant(this.activeSession, playerId, name);
		const combatant = findPlayerCombatant(this.activeSession, playerId);
		if (!combatant) {
			throw new Error("Failed to create player combatant.");
		}

		this.players.set(playerId, {
			playerId,
			name,
			combatantId: combatant.id,
			online: true,
			lastSeenAt: now,
		});

		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);

		return {
			playerId,
			combatantId: combatant.id,
			name,
		};
	}

	private handlePlayerLeave(playerId: string): void {
		const player = this.players.get(playerId);
		if (!player) {
			return;
		}

		player.online = false;
		player.lastSeenAt = new Date().toISOString();
		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);
	}

	private handleInitiativeSubmit(payload: InitiativeSubmitPayload): boolean {
		const next = applyInitiativeSubmit(
			this.activeSession,
			this.encounterRunning,
			resolvePlayerCombatantId(this.players, payload.playerId),
			payload,
		);
		return this.applySessionUpdate(next);
	}

	private handlePlayerUpdate(payload: PlayerUpdatePayload): boolean {
		const next = applyPlayerUpdate(this.activeSession, resolvePlayerCombatantId(this.players, payload.playerId), payload);
		return this.applySessionUpdate(next);
	}

	private handlePlayerDeathSaves(payload: PlayerDeathSavesPayload): boolean {
		const next = applyPlayerDeathSaves(
			this.activeSession,
			resolvePlayerCombatantId(this.players, payload.playerId),
			payload,
		);
		return this.applySessionUpdate(next);
	}

	private handleEndTurn(payload: EndTurnPayload): boolean {
		const next = applyEndTurn(
			this.activeSession,
			this.encounterRunning,
			resolvePlayerCombatantId(this.players, payload.playerId),
			payload,
		);
		return this.applySessionUpdate(next);
	}

	private applySessionUpdate(next: CombatSession | null): boolean {
		if (next === this.activeSession) {
			return false;
		}
		this.activeSession = next;
		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);
		return true;
	}

	private buildStateSync(playerId: string): StateSyncPayload {
		const players = Array.from(this.players.values());
		return {
			session: this.activeSession,
			playerState: buildPlayerViewState(this.activeSession, this.encounterRunning, players, playerId, this.theme),
		};
	}

	private emitStateSyncToAllPlayers(): void {
		this.sse.broadcastState((playerId) => this.buildStateSync(playerId));
	}

	private async loadPlayerClientScript(): Promise<string> {
		if (this.playerClientScript !== null) {
			return this.playerClientScript;
		}

		const scriptPath = join(this.assetRootDir, "player-client.js");
		this.playerClientScript = await readFile(scriptPath, "utf8");
		return this.playerClientScript;
	}
}
