import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import {
	advanceCombatTurn,
	createCombatSession,
	setActiveToTopCombatant,
	setCombatantAc,
	setCombatantHp,
	setCombatantHpMax,
	setCombatantInitiative,
	setCombatantTempHp,
	upsertPlayerCombatant,
	type CombatSession,
} from "../encounter/combat-session";
import type {
	CombatantId,
	EndTurnPayload,
	InitiativeSubmitPayload,
	PlayerId,
	PlayerJoinRequest,
	PlayerJoinResponse,
	PlayerPresenceState,
	PlayerTheme,
	PlayerUpdatePayload,
	StateSyncPayload,
} from "./player-events";
import { buildPlayerViewState } from "./player-view-state";
import { renderInviteQrSvg } from "./player-client/invite-qr";
import { renderPlayerPageHtml } from "./player-client/render-player-page";

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
	private readonly players = new Map<PlayerId, PlayerPresenceState>();
	private readonly sseClients = new Map<PlayerId, Set<ServerResponse>>();
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
			inviteUrls: actualPort === null ? [] : this.buildInviteUrls(actualPort, token),
		};

		return this.getState();
	}

	async stop(): Promise<void> {
		this.emitServerShutdownToAllPlayers();
		this.closeAllSseClients();

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
			const combatant = this.findPlayerCombatant(next, player.playerId);
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

	setOnSessionChange(callback: ((session: CombatSession | null) => void) | null): void {
		this.onSessionChange = callback;
	}

	private async handleRequest(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
		try {
			this.applySecurityHeaders(res);
			const pathname = this.readPathname(req.url);
			const method = req.method ?? "GET";
			if (pathname === "/health") {
				this.sendJson(res, 200, { ok: true });
				return;
			}

			if (!this.isAuthorizedRequest(req, token)) {
				this.sendJson(res, 401, { ok: false, error: "Invalid or missing room token." });
				return;
			}

			if (pathname === "/" && method === "GET") {
				this.sendHtml(res, 200, renderPlayerPageHtml(this.theme, this.supportUrl));
				return;
			}

			if (pathname === "/api/session" && method === "GET") {
				this.sendJson(res, 200, {
					ok: true,
					session: this.activeSession,
					running: this.encounterRunning,
				});
				return;
			}

			if (pathname === "/api/invite-qr" && method === "GET") {
				const inviteUrl = this.resolveInviteUrl(req, token);
				const svg = await renderInviteQrSvg(inviteUrl);
				this.sendSvg(res, 200, svg);
				return;
			}

			if (pathname === "/api/player/state" && method === "GET") {
				const queryPlayerId = this.readQuery(req.url).get("playerId") ?? "";
				if (!queryPlayerId || !this.players.has(queryPlayerId)) {
					this.sendJson(res, 400, { ok: false, error: "Unknown playerId." });
					return;
				}
				this.sendJson(res, 200, {
					ok: true,
					state: this.buildStateSync(queryPlayerId),
				});
				return;
			}

			if (pathname === "/api/player/stream" && method === "GET") {
				const queryPlayerId = this.readQuery(req.url).get("playerId") ?? "";
				if (!queryPlayerId || !this.players.has(queryPlayerId)) {
					this.sendJson(res, 400, { ok: false, error: "Unknown playerId." });
					return;
				}
				this.openStateStream(req, res, queryPlayerId);
				return;
			}

			if (pathname === "/api/player/join" && method === "POST") {
				const payload = await this.readJsonBody<PlayerJoinRequest>(req);
				const result = this.handlePlayerJoin(payload);
				this.sendJson(res, 200, {
					ok: true,
					player: result,
					state: this.buildStateSync(result.playerId),
				});
				return;
			}

			if (pathname === "/api/player/leave" && method === "POST") {
				const payload = await this.readJsonBody<{ playerId: string }>(req);
				this.handlePlayerLeave(payload.playerId);
				this.sendJson(res, 200, { ok: true });
				return;
			}

			if (pathname === "/api/player/initiative" && method === "POST") {
				const payload = await this.readJsonBody<InitiativeSubmitPayload>(req);
				const changed = this.handleInitiativeSubmit(payload);
				this.sendJson(res, 200, {
					ok: changed,
					state: this.buildStateSync(payload.playerId),
				});
				return;
			}

			if (pathname === "/api/player/update" && method === "POST") {
				const payload = await this.readJsonBody<PlayerUpdatePayload>(req);
				const changed = this.handlePlayerUpdate(payload);
				this.sendJson(res, 200, {
					ok: changed,
					state: this.buildStateSync(payload.playerId),
				});
				return;
			}

			if (pathname === "/api/player/end-turn" && method === "POST") {
				const payload = await this.readJsonBody<EndTurnPayload>(req);
				const changed = this.handleEndTurn(payload);
				this.sendJson(res, 200, {
					ok: changed,
					state: this.buildStateSync(payload.playerId),
				});
				return;
			}

			this.sendJson(res, 404, { ok: false, error: "Not found." });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Request failed.";
			this.sendJson(res, 400, { ok: false, error: message });
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
		const combatant = this.findPlayerCombatant(this.activeSession, playerId);
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
		const player = this.players.get(payload.playerId);
		if (!player || !this.activeSession) {
			return false;
		}

		const total = Number.isFinite(payload.initiativeTotal) ? Math.trunc(payload.initiativeTotal) : NaN;
		if (!Number.isFinite(total)) {
			return false;
		}

		const shouldFollowTopOnOpeningTurn =
			this.encounterRunning && this.activeSession.round === 1 && this.activeSession.activeIndex === 0;
		const rollType =
			payload.rollType === "nat1" || payload.rollType === "nat20" || payload.rollType === "normal"
				? payload.rollType
				: "normal";
		let next = setCombatantInitiative(this.activeSession, player.combatantId, total, rollType);
		if (shouldFollowTopOnOpeningTurn) {
			next = setActiveToTopCombatant(next);
		}
		if (next === this.activeSession) {
			return false;
		}
		this.activeSession = next;
		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);
		return true;
	}

	private handlePlayerUpdate(payload: PlayerUpdatePayload): boolean {
		const player = this.players.get(payload.playerId);
		if (!player || !this.activeSession) {
			return false;
		}

		let next = this.activeSession;
		if (payload.hpCurrent !== undefined) {
			next = setCombatantHp(next, player.combatantId, payload.hpCurrent);
		}
		if (payload.hpMax !== undefined) {
			next = setCombatantHpMax(next, player.combatantId, payload.hpMax);
		}
		if (payload.tempHp !== undefined) {
			next = setCombatantTempHp(next, player.combatantId, Math.max(0, Math.trunc(payload.tempHp)));
		}
		if (payload.ac !== undefined) {
			next = setCombatantAc(next, player.combatantId, payload.ac);
		}

		if (next === this.activeSession) {
			return false;
		}
		this.activeSession = next;
		this.emitStateSyncToAllPlayers();
		this.onSessionChange?.(this.activeSession);
		return true;
	}

	private handleEndTurn(payload: EndTurnPayload): boolean {
		const player = this.players.get(payload.playerId);
		if (!player || !this.activeSession || !this.encounterRunning) {
			return false;
		}

		const active = this.activeSession.combatants[this.activeSession.activeIndex];
		if (!active || active.id !== player.combatantId) {
			return false;
		}

		this.activeSession = advanceCombatTurn(this.activeSession);
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

	private openStateStream(req: IncomingMessage, res: ServerResponse, playerId: PlayerId): void {
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.write("retry: 2000\n\n");

		const clients = this.sseClients.get(playerId) ?? new Set<ServerResponse>();
		clients.add(res);
		this.sseClients.set(playerId, clients);
		this.sendSse(res, "state_sync", this.buildStateSync(playerId));

		req.on("close", () => {
			const group = this.sseClients.get(playerId);
			if (!group) {
				return;
			}
			group.delete(res);
			if (group.size === 0) {
				this.sseClients.delete(playerId);
			}
		});
	}

	private sendSse(res: ServerResponse, eventName: string, payload: unknown): void {
		res.write(`event: ${eventName}\n`);
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
	}

	private emitStateSyncToAllPlayers(): void {
		if (this.sseClients.size === 0) {
			return;
		}

		for (const [playerId, clients] of this.sseClients) {
			const payload = this.buildStateSync(playerId);
			for (const client of clients) {
				this.sendSse(client, "state_sync", payload);
			}
		}
	}

	private emitServerShutdownToAllPlayers(): void {
		if (this.sseClients.size === 0) {
			return;
		}

		for (const clients of this.sseClients.values()) {
			for (const client of clients) {
				this.sendSse(client, "server_shutdown", { ok: true, message: "Encounter server has shut down." });
			}
		}
	}

	private closeAllSseClients(): void {
		for (const clients of this.sseClients.values()) {
			for (const client of clients) {
				client.end();
			}
		}
		this.sseClients.clear();
	}

	private findPlayerCombatant(session: CombatSession, playerId: string): { id: CombatantId } | null {
		const combatant = session.combatants.find((candidate) => candidate.monster.id === `player::${playerId}`) ?? null;
		return combatant ? { id: combatant.id } : null;
	}

	private async readJsonBody<T>(req: IncomingMessage): Promise<T> {
		const chunks: Uint8Array[] = [];
		const encoder = new TextEncoder();
		for await (const chunk of req) {
			if (chunk instanceof Uint8Array) {
				chunks.push(chunk);
				continue;
			}
			chunks.push(encoder.encode(String(chunk)));
		}

		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const merged = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.length;
		}

		const raw = new TextDecoder().decode(merged).trim();
		if (!raw.length) {
			return {} as T;
		}
		return JSON.parse(raw) as T;
	}

	private applySecurityHeaders(res: ServerResponse): void {
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader("Referrer-Policy", "no-referrer");
	}

	private sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
		const body = JSON.stringify(payload);
		res.statusCode = statusCode;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.end(body);
	}

	private sendHtml(res: ServerResponse, statusCode: number, html: string): void {
		res.statusCode = statusCode;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(html);
	}

	private sendSvg(res: ServerResponse, statusCode: number, svg: string): void {
		res.statusCode = statusCode;
		res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
		res.setHeader("Cache-Control", "no-store");
		res.end(svg);
	}

	private resolveInviteUrl(req: IncomingMessage, token: string): string {
		const hostHeader = typeof req.headers.host === "string" ? req.headers.host.trim() : "";
		if (hostHeader.length > 0) {
			return `http://${hostHeader}/?token=${encodeURIComponent(token)}`;
		}
		return this.state.inviteUrls[0] ?? `http://127.0.0.1/?token=${encodeURIComponent(token)}`;
	}

	private isAuthorizedRequest(req: IncomingMessage, token: string): boolean {
		const queryToken = this.readQuery(req.url).get("token");
		const headerToken = this.readHeaderToken(req.headers.authorization);
		return this.matchesToken(queryToken, token) || this.matchesToken(headerToken, token);
	}

	private matchesToken(candidate: string | null, token: string): boolean {
		if (!candidate) {
			return false;
		}

		const encoder = new TextEncoder();
		const expected = encoder.encode(token);
		const actual = encoder.encode(candidate);
		if (expected.length !== actual.length) {
			return false;
		}
		return timingSafeEqual(expected, actual);
	}

	private readHeaderToken(authorization: string | string[] | undefined): string | null {
		const header = Array.isArray(authorization) ? authorization[0] : authorization;
		if (!header) {
			return null;
		}

		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		return match?.[1]?.trim() ?? null;
	}

	private readQuery(url: string | undefined): URLSearchParams {
		if (!url) {
			return new URLSearchParams();
		}
		return new URL(url, "http://encounter-cast.local").searchParams;
	}

	private readPathname(url: string | undefined): string {
		if (!url) {
			return "";
		}

		return new URL(url, "http://encounter-cast.local").pathname;
	}

	private buildInviteUrls(port: number, token: string): string[] {
		const urls = new Set<string>();
		for (const address of this.getIpv4Addresses()) {
			urls.add(`http://${address}:${port}/?token=${token}`);
		}
		return Array.from(urls);
	}

	private getIpv4Addresses(): string[] {
		const interfaces = networkInterfaces();
		const addresses: string[] = [];

		for (const details of Object.values(interfaces)) {
			if (!details) {
				continue;
			}

			for (const detail of details) {
				if (detail.family !== "IPv4" || detail.internal) {
					continue;
				}
				addresses.push(detail.address);
			}
		}

		if (addresses.length === 0) {
			addresses.push("127.0.0.1");
		}

		return addresses;
	}

}
