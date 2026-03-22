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
				this.sendHtml(res, 200, this.renderPlayerPage());
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

	private renderPlayerPage(): string {
		const theme = this.theme ?? {
			backgroundPrimary: "#1f1f1f",
			backgroundSecondary: "#2a2a2a",
			textNormal: "#e8e8e8",
			textMuted: "#aaaaaa",
			textError: "#e05a5a",
			interactiveAccent: "#5ea6ff",
			textOnAccent: "#ffffff",
			border: "#3a3a3a",
		};

		const supportUrlJson = JSON.stringify(this.supportUrl ?? "");

		return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EncounterCast Player</title>
  <style>
    :root { color-scheme: dark light; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: ${theme.backgroundPrimary};
      color: ${theme.textNormal};
    }
    .wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 16px 16px 260px;
    }
    .panel {
      border: 1px solid ${theme.border};
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      background: ${theme.backgroundSecondary};
    }
    .app-shell {
      margin-bottom: 8px;
    }
    .app-header {
      margin-bottom: 8px;
      justify-content: center;
    }
    #status {
      text-align: center;
      margin-bottom: 6px;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    input, button {
      padding: 8px;
      border-radius: 8px;
      border: 1px solid ${theme.border};
      background: transparent;
      color: inherit;
    }
    input::placeholder {
      color: ${theme.textMuted};
    }
    button {
      background: ${theme.interactiveAccent};
      color: ${theme.textOnAccent};
      border: 0;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .subtle {
      color: ${theme.textMuted};
      font-size: 12px;
    }
    .combatant {
      border: 1px solid ${theme.border};
      border-radius: 10px;
      padding: 8px;
      margin-top: 8px;
      background: ${theme.backgroundSecondary};
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .combatant.active {
      border-color: ${theme.interactiveAccent};
    }
    .combatant.is-self {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    }
    .combatant.is-your-turn {
      animation: pulse 1.2s ease-in-out infinite;
    }
    .initiative {
      position: relative;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
    }
    .initiative svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      fill: ${theme.interactiveAccent};
      stroke: ${theme.interactiveAccent};
      stroke-width: 1.4;
    }
    .initiative span {
      position: relative;
      z-index: 1;
      color: ${theme.textOnAccent};
    }
    .name-block {
      min-width: 0;
      flex: 1 1 auto;
    }
    .name {
      font-weight: 600;
      line-height: 1.2;
      word-break: break-word;
    }
    .hp-label {
      text-transform: capitalize;
      font-size: 12px;
      margin-top: 2px;
      color: ${theme.textMuted};
    }
    .hp-label.is-unscathed, .hp-label.is-healthy {
      color: #3bb273;
    }
    .hp-label.is-hurt {
      color: #d8a106;
    }
    .hp-label.is-critically-wounded, .hp-label.is-down {
      color: #e05a5a;
    }
    .hp-label.is-dead {
      color: #7e8791;
    }
    .tail {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      margin-left: auto;
      justify-content: flex-end;
    }
    .shield {
      position: relative;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
    }
    .shield svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      fill: ${theme.interactiveAccent};
      stroke: ${theme.interactiveAccent};
      stroke-width: 1.4;
    }
    .shield span {
      position: relative;
      z-index: 1;
      color: ${theme.textOnAccent};
    }
    .shield.placeholder {
      opacity: 0;
      pointer-events: none;
    }
    .stats {
      display: flex;
      gap: 8px;
      color: ${theme.textMuted};
      font-size: 12px;
      white-space: nowrap;
      flex-wrap: wrap;
    }
    .stats strong {
      color: ${theme.textNormal};
      font-weight: 600;
      margin-left: 3px;
    }
    .stat-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid ${theme.border};
      border-radius: 999px;
      padding: 2px 8px;
      background: ${theme.backgroundPrimary};
    }
    .stat-chip .icon {
      opacity: 0.9;
    }
    .self-health {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: ${theme.textError};
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
    }
    .heart-badge {
      position: relative;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .heart-badge svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      fill: ${theme.backgroundPrimary};
      stroke: ${theme.textError};
      stroke-width: 1.5;
    }
    .self-health-temp {
      margin-left: 4px;
      font-size: 14px;
      font-weight: 700;
    }
    .sheet {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      border-top: 1px solid ${theme.border};
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
      background: ${theme.backgroundSecondary};
      padding: 12px 16px 14px;
      box-sizing: border-box;
      z-index: 40;
    }
    .sheet-handle {
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background: ${theme.textMuted};
      opacity: 0.55;
      margin: 0 auto 10px;
    }
    .sheet-header {
      margin-bottom: 8px;
    }
    .sheet-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .sheet-grid label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: ${theme.textMuted};
    }
    .sheet-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
    }
    .sheet-actions button {
      width: 100%;
      min-height: 48px;
      font-size: 15px;
      font-weight: 600;
      background: transparent;
      border: 1px solid ${theme.border};
      color: ${theme.textNormal};
    }
    .sheet-actions button.is-active {
      background: ${theme.interactiveAccent};
      border-color: transparent;
      color: ${theme.textOnAccent};
    }
    .sheet-actions button.is-hidden {
      display: none;
    }
    .sheet-actions .sep {
      color: ${theme.textMuted};
      opacity: 0.9;
      padding: 0 4px;
    }
    .sheet-panel {
      max-height: 0;
      opacity: 0;
      transform: translateY(8px);
      overflow: hidden;
      pointer-events: none;
      margin-top: 0;
      transition:
        max-height 220ms cubic-bezier(0.2, 0, 0, 1),
        opacity 170ms ease,
        transform 220ms cubic-bezier(0.2, 0, 0, 1),
        margin-top 220ms cubic-bezier(0.2, 0, 0, 1);
    }
    .sheet-panel.open {
      max-height: 420px;
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
      margin-top: 8px;
    }
    .sheet-panel .sheet-grid,
    .sheet-panel label {
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 160ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1);
    }
    .sheet-panel.open .sheet-grid,
    .sheet-panel.open label {
      opacity: 1;
      transform: translateY(0);
    }
    .sheet-summary {
      color: ${theme.textNormal};
      font-size: 13px;
      margin-bottom: 2px;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .sheet-summary.is-hidden {
      display: none;
    }
    .sheet-summary-shield,
    .sheet-summary-heart {
      position: relative;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
    }
    .sheet-summary-shield svg,
    .sheet-summary-heart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      fill: ${theme.backgroundPrimary};
      stroke: ${theme.border};
      stroke-width: 1.4;
    }
    .sheet-summary-shield span,
    .sheet-summary-heart span {
      position: relative;
      z-index: 1;
    }
    .sheet-summary-hp {
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .sheet-summary-temp {
      color: ${theme.textMuted};
      margin-left: 4px;
      font-weight: 600;
    }
    .sheet-turn-cta {
      max-height: 0;
      opacity: 0;
      transform: translateY(18px);
      overflow: hidden;
      transition: max-height 180ms ease, opacity 180ms ease, transform 180ms ease;
    }
    .sheet-turn-cta.is-visible {
      max-height: 52px;
      opacity: 1;
      transform: translateY(0);
      margin-top: 8px;
    }
    .sheet-turn-cta button {
      width: 100%;
      background: ${theme.interactiveAccent};
      color: ${theme.textOnAccent};
      border: 0;
      font-weight: 600;
    }
    .initiative-gate {
      position: fixed;
      inset: 0;
      display: none;
      z-index: 100;
      background: ${theme.backgroundPrimary};
      padding: 20px;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
    }
    .initiative-gate.open {
      display: flex;
    }
    .initiative-gate-card {
      width: min(420px, 100%);
      border: 1px solid ${theme.border};
      border-radius: 14px;
      background: ${theme.backgroundSecondary};
      padding: 16px;
      text-align: center;
    }
    .initiative-gate-card h2 {
      margin: 0 0 12px;
    }
    .initiative-gate-card input {
      width: 100%;
      font-size: 18px;
      padding: 10px;
      box-sizing: border-box;
      text-align: center;
      margin-bottom: 10px;
    }
    .initiative-gate-card button {
      width: 100%;
      font-size: 15px;
      font-weight: 600;
    }
    .shutdown-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .shutdown-card {
      border: 1px solid ${theme.border};
      border-radius: 14px;
      background: ${theme.backgroundSecondary};
      padding: 18px 16px;
      max-width: 520px;
      width: 100%;
    }
    .shutdown-card h2 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    .shutdown-card p {
      margin: 0;
      color: ${theme.textMuted};
      font-size: 13px;
    }
    .shutdown-card a {
      color: ${theme.textMuted};
      text-decoration: underline;
    }
    .initiative-roll-toggle {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .initiative-roll-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid ${theme.border};
      background: transparent;
      color: ${theme.textNormal};
      min-height: 42px;
      font-weight: 600;
    }
    .initiative-roll-btn.is-active {
      background: ${theme.interactiveAccent};
      color: #fff;
      border-color: transparent;
    }
    .initiative-roll-btn .hex {
      font-weight: 700;
      font-size: 12px;
      min-width: 18px;
      text-align: center;
    }
    .initiative-roll-btn.hex-only {
      padding: 8px;
      min-width: 56px;
    }
    .initiative-mini-hex {
      position: relative;
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: inherit;
      line-height: 1;
    }
    .initiative-mini-hex svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      fill: ${theme.backgroundPrimary};
      stroke: currentColor;
      stroke-width: 1.6;
    }
    .initiative-mini-hex span {
      position: relative;
      z-index: 1;
    }
    .initiative-roll-btn .hex.red {
      color: #e05a5a;
    }
    .initiative-roll-btn .hex.green {
      color: #3bb273;
    }
    .initiative-roll-btn.is-active .hex.red,
    .initiative-roll-btn.is-active .hex.green {
      color: ${theme.textOnAccent};
    }
    @media (max-width: 640px) {
      .wrap {
        padding: 14px 14px 290px;
      }
      input, button {
        min-height: 44px;
        font-size: 16px;
        padding: 10px 12px;
      }
      .sheet {
        padding-bottom: calc(14px + env(safe-area-inset-bottom));
      }
      .sheet-grid {
        grid-template-columns: 1fr;
      }
      .sheet-summary {
        font-size: 13px;
      }
      .sheet-panel.open {
        max-height: 520px;
      }
      .initiative-gate-card {
        padding: 18px;
      }
      .initiative-gate-card h2 {
        font-size: 28px;
      }
      .initiative-gate-card input {
        min-height: 52px;
        font-size: 21px;
      }
      .initiative-gate-card button {
        min-height: 52px;
        font-size: 17px;
      }
      .initiative-roll-btn {
        min-height: 48px;
        font-size: 14px;
      }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: inset 0 0 0 1px ${theme.interactiveAccent}; }
      50% { box-shadow: inset 0 0 0 2px ${theme.interactiveAccent}; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel" id="joinPanel">
      <h3>Join encounter</h3>
      <div class="sheet-grid">
        <label>Name<input id="nameInput" placeholder="Your name" /></label>
        <label>AC<input id="joinAcInput" type="number" placeholder="Optional" /></label>
        <label>HP<input id="joinHpInput" type="number" placeholder="Optional" /></label>
        <label>Max HP<input id="joinHpMaxInput" type="number" placeholder="Optional" /></label>
        <label>Temp HP<input id="joinTempHpInput" type="number" placeholder="Optional" /></label>
      </div>
      <div class="row"><button id="joinBtn">Join</button></div>
      <div id="joinMsg"></div>
    </div>
    <div id="appPanel" class="app-shell" style="display:none;">
      <div class="app-header row"><strong id="title">Encounter</strong></div>
      <div id="status"></div>
      <div id="list"></div>
    </div>
  </div>
  <div id="initiativeGate" class="initiative-gate" aria-live="polite">
    <div class="initiative-gate-card">
      <h2>Roll Initiative!</h2>
      <input id="initiativeGateInput" type="number" inputmode="numeric" placeholder="Initiative total" />
      <div class="initiative-roll-toggle">
        <button id="initiativeNat1Btn" class="initiative-roll-btn hex-only" type="button" aria-label="Natural 1">
          <span class="initiative-mini-hex hex red">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z"></path></svg>
            <span>1</span>
          </span>
        </button>
        <button id="initiativeNormalBtn" class="initiative-roll-btn is-active" type="button"><span>Normal</span></button>
        <button id="initiativeNat20Btn" class="initiative-roll-btn hex-only" type="button" aria-label="Natural 20">
          <span class="initiative-mini-hex hex green">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z"></path></svg>
            <span>20</span>
          </span>
        </button>
      </div>
      <button id="initiativeGateSubmit" type="button">Submit initiative</button>
    </div>
  </div>
  <div id="sheetRoot" class="sheet" style="display:none;">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div id="editPanel" class="sheet-panel">
      <div class="sheet-grid">
        <label>AC<input id="sheetAc" type="number" placeholder="AC" /></label>
        <label>HP<input id="sheetHp" type="number" placeholder="HP" /></label>
        <label>Max HP<input id="sheetHpMax" type="number" placeholder="Max HP" /></label>
        <label>Temp HP<input id="sheetTempHp" type="number" placeholder="Temp HP" /></label>
      </div>
    </div>
    <div class="sheet-header">
      <div id="sheetSummary" class="sheet-summary">
        <span class="sheet-summary-shield"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z"></path></svg><span>-</span></span>
        <span class="sheet-summary-heart"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z"></path></svg><span></span></span>
        <span class="sheet-summary-hp">-/-</span>
        <span class="sheet-summary-temp">+0</span>
      </div>
    </div>
    <div id="damagePanel" class="sheet-panel">
      <div class="sheet-grid">
        <label>Damage / heal<input id="sheetDamage" type="number" placeholder="e.g. 7 damage or -7 heal" /></label>
      </div>
    </div>
    <div class="sheet-actions">
      <button id="editModeBtn" type="button">Edit stats</button>
      <button id="damageModeBtn" type="button">Damage <span class="sep">|</span> Heal</button>
    </div>
    <div id="sheetTurnCta" class="sheet-turn-cta">
      <button id="endRoundBtn" type="button">End round</button>
    </div>
  </div>
  <script>
    const qs = new URLSearchParams(window.location.search);
    const token = qs.get("token") || "";
    const joinPanel = document.getElementById("joinPanel");
    const appPanel = document.getElementById("appPanel");
    const nameInput = document.getElementById("nameInput");
    const joinAcInput = document.getElementById("joinAcInput");
    const joinHpInput = document.getElementById("joinHpInput");
    const joinHpMaxInput = document.getElementById("joinHpMaxInput");
    const joinTempHpInput = document.getElementById("joinTempHpInput");
    const joinBtn = document.getElementById("joinBtn");
    const joinMsg = document.getElementById("joinMsg");
    const statusEl = document.getElementById("status");
    const listEl = document.getElementById("list");
    const initiativeGate = document.getElementById("initiativeGate");
    const initiativeGateInput = document.getElementById("initiativeGateInput");
    const initiativeNat1Btn = document.getElementById("initiativeNat1Btn");
    const initiativeNormalBtn = document.getElementById("initiativeNormalBtn");
    const initiativeNat20Btn = document.getElementById("initiativeNat20Btn");
    const initiativeGateSubmit = document.getElementById("initiativeGateSubmit");
    const titleEl = document.getElementById("title");
    const sheetRoot = document.getElementById("sheetRoot");
    const sheetSummary = document.getElementById("sheetSummary");
    const editModeBtn = document.getElementById("editModeBtn");
    const damageModeBtn = document.getElementById("damageModeBtn");
    const editPanel = document.getElementById("editPanel");
    const damagePanel = document.getElementById("damagePanel");
    const sheetAc = document.getElementById("sheetAc");
    const sheetHp = document.getElementById("sheetHp");
    const sheetHpMax = document.getElementById("sheetHpMax");
    const sheetTempHp = document.getElementById("sheetTempHp");
    const sheetDamage = document.getElementById("sheetDamage");
    const sheetTurnCta = document.getElementById("sheetTurnCta");
    const endRoundBtn = document.getElementById("endRoundBtn");
    const supportUrl = ${supportUrlJson};
    let playerId = localStorage.getItem("encounter-cast-player-id") || "";
    let stream = null;
    let serverShutDown = false;
    let lastState = null;
    let sheetMode = "none";
    let initiativeGateOpen = false;
    let initiativeRollType = "normal";
    let lastActiveCombatantId = null;
    let previousCombatantOrderKey = "";
    let hasRenderedCombatants = false;

    async function api(path, method = "GET", body) {
      const url = path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return res.json();
    }

    function readNum(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const value = el.value.trim();
      if (!value.length) return null;
      const n = Number.parseInt(value, 10);
      return Number.isFinite(n) ? n : null;
    }

    function readOptionalInputNumber(el) {
      if (!el) return null;
      const value = el.value.trim();
      if (!value.length) return null;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function hpClass(label) {
      return "hp-label is-" + String(label).replaceAll(" ", "-");
    }

    function escText(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function escAttr(value) {
      return escText(value).replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function renderShutdownScreen() {
      const supportCopyPrefix = "If you enjoyed this plugin, consider supporting the author by ";
      const supportCopyLink = "buying him a coffee!";
      const supportCopyFallback = "If you enjoyed this plugin, consider supporting the author by buying him a coffee!";
      const supportLine = supportUrl
        ? supportCopyPrefix + "<a href='" + escAttr(supportUrl) + "' target='_blank' rel='noopener noreferrer'>" + supportCopyLink + "</a>"
        : supportCopyFallback;

      document.body.innerHTML =
        "<div class='shutdown-screen'><div class='shutdown-card'>" +
          "<h2>Thanks for playing!</h2>" +
          "<p>" + supportLine + "</p>" +
        "</div></div>";
    }

    function setSheetMode(mode) {
      sheetMode = mode;
      const isEdit = mode === "edit";
      const isDamage = mode === "damage";
      editPanel.classList.toggle("open", isEdit);
      damagePanel.classList.toggle("open", isDamage);
      editModeBtn.classList.toggle("is-active", isEdit);
      damageModeBtn.classList.toggle("is-active", isDamage);
      editModeBtn.classList.toggle("is-hidden", isDamage);
      sheetSummary.classList.toggle("is-hidden", isEdit);
      editModeBtn.textContent = isEdit ? "Save stats" : "Edit stats";
      damageModeBtn.innerHTML = isDamage
        ? "Apply Damage <span class='sep'>|</span> Heal"
        : "Damage <span class='sep'>|</span> Heal";
      if (isDamage) {
        setTimeout(() => {
          sheetDamage.focus();
          sheetDamage.select();
          ensureDamageActionVisible();
        }, 20);
        setTimeout(() => {
          ensureDamageActionVisible();
        }, 220);
        setTimeout(() => {
          ensureDamageActionVisible();
        }, 420);
      }
    }

    function setSheetFromSelf(self) {
      if (!self) {
        sheetSummary.innerHTML =
          "<span class='sheet-summary-shield'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z'></path></svg><span>-</span></span>" +
          "<span class='sheet-summary-heart'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z'></path></svg><span></span></span>" +
          "<span class='sheet-summary-hp'>-/-</span>" +
          "<span class='sheet-summary-temp'>+0</span>";
        sheetAc.value = "";
        sheetHp.value = "";
        sheetHpMax.value = "";
        sheetTempHp.value = "";
        if (sheetMode !== "damage") {
          sheetDamage.value = "";
        }
        return;
      }
      sheetSummary.innerHTML =
        "<span class='sheet-summary-shield'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z'></path></svg><span>" + esc(self.ac ?? "-") + "</span></span>" +
        "<span class='sheet-summary-heart'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z'></path></svg><span></span></span>" +
        "<span class='sheet-summary-hp'>" + esc(self.hpCurrent ?? "-") + "/" + esc(self.hpMax ?? "-") + "</span>" +
        "<span class='sheet-summary-temp'>+" + esc(self.tempHp ?? 0) + "</span>";
      sheetAc.value = self.ac ?? "";
      sheetHp.value = self.hpCurrent ?? "";
      sheetHpMax.value = self.hpMax ?? "";
      sheetTempHp.value = self.tempHp ?? 0;
      if (sheetMode !== "damage") {
        sheetDamage.value = "";
      }
    }

    async function saveFromSheet() {
      if (!playerId) return;
      await api("/api/player/update", "POST", {
        playerId,
        ac: readNum("sheetAc"),
        hpCurrent: readNum("sheetHp"),
        hpMax: readNum("sheetHpMax"),
        tempHp: readNum("sheetTempHp") ?? 0
      });
      await refresh();
      setSheetMode("none");
    }

    async function applyDamageFromSheet() {
      if (!playerId || !lastState) return;
      const ps = lastState.playerState;
      const self = ps.combatants.find((c) => c.isSelf);
      if (!self) return;

      const rawDamage = readNum("sheetDamage");
      if (rawDamage === null) {
        setSheetMode("none");
        return;
      }
      let hpCurrent = self.hpCurrent ?? 0;
      let hpMax = self.hpMax;
      let tempHp = self.tempHp ?? 0;
      const amount = rawDamage;

      if (amount >= 0) {
        const remainingAfterTemp = Math.max(0, amount - tempHp);
        tempHp = Math.max(0, tempHp - amount);
        hpCurrent = Math.max(0, hpCurrent - remainingAfterTemp);
      } else {
        const heal = Math.abs(amount);
        const unclamped = hpCurrent + heal;
        hpCurrent = hpMax === null ? unclamped : Math.min(hpMax, unclamped);
      }

      await api("/api/player/update", "POST", {
        playerId,
        hpCurrent,
        tempHp
      });
      await refresh();
      sheetDamage.value = "";
      setSheetMode("none");
    }

    function initiativeMarkup(value) {
      return "<span class='initiative'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z'></path></svg><span>" + esc(value) + "</span></span>";
    }

    function shieldMarkup(value, isPlaceholder) {
      const cls = "shield" + (isPlaceholder ? " placeholder" : "");
      return "<span class='" + cls + "'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z'></path></svg><span>" + esc(value ?? "-") + "</span></span>";
    }

    function setInitiativeRollType(nextType) {
      initiativeRollType = nextType;
      initiativeNat1Btn.classList.toggle("is-active", nextType === "nat1");
      initiativeNormalBtn.classList.toggle("is-active", nextType === "normal");
      initiativeNat20Btn.classList.toggle("is-active", nextType === "nat20");
    }

    function scrollRowIntoVisibleArea(row) {
      const rowRect = row.getBoundingClientRect();
      const sheetInset = sheetRoot && sheetRoot.style.display !== "none" ? sheetRoot.offsetHeight : 0;
      const topLimit = 8;
      const bottomLimit = window.innerHeight - sheetInset - 8;

      if (rowRect.bottom > bottomLimit) {
        window.scrollBy({ top: rowRect.bottom - bottomLimit, behavior: "smooth" });
        return;
      }
      if (rowRect.top < topLimit) {
        window.scrollBy({ top: rowRect.top - topLimit, behavior: "smooth" });
      }
    }

    function ensureDamageActionVisible() {
      if (sheetMode !== "damage") {
        return;
      }
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const buttonRect = damageModeBtn.getBoundingClientRect();
      const isTouchLike = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      const keyboardAccessoryGuard = window.visualViewport && isTouchLike ? 62 : 0;
      const bottomPadding = 10 + keyboardAccessoryGuard;
      const safeBottom = viewportBottom - bottomPadding;
      if (buttonRect.bottom > safeBottom) {
        window.scrollBy({
          top: buttonRect.bottom - safeBottom,
          behavior: "smooth",
        });
      }
    }

    function openInitiativeGate() {
      if (initiativeGateOpen) return;
      initiativeGateOpen = true;
      setInitiativeRollType("normal");
      initiativeGate.classList.add("open");
      setTimeout(() => {
        initiativeGateInput.focus();
        initiativeGateInput.select();
      }, 30);
    }

    function closeInitiativeGate() {
      initiativeGateOpen = false;
      initiativeGate.classList.remove("open");
      initiativeGateInput.value = "";
    }

    function render(state) {
      lastState = state;
      const ps = state.playerState;
      titleEl.textContent = "Round " + ps.round;
      statusEl.textContent = ps.encounterRunning ? "Combat running" : "Waiting for combat start";
      const self = ps.combatants.find((c) => c.isSelf);
      const active = ps.activeCombatantId;
      const isYourTurn = !!self && ps.encounterRunning && self.id === active;
      endRoundBtn.disabled = !isYourTurn;
      sheetTurnCta.classList.toggle("is-visible", isYourTurn);
      editModeBtn.disabled = !self;
      damageModeBtn.disabled = !self;
      setSheetFromSelf(self);

      const needsInitiative = !!self && ps.encounterRunning && (self.initiative === null || self.initiative === undefined);
      if (needsInitiative) {
        openInitiativeGate();
      } else {
        closeInitiativeGate();
      }

      const previousElements = new Map();
      const previousRects = new Map();
      for (const node of listEl.children) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const id = node.dataset.combatantId;
        if (!id) {
          continue;
        }
        previousElements.set(id, node);
        previousRects.set(id, node.getBoundingClientRect());
      }
      const previousIds = new Set(previousElements.keys());

      listEl.innerHTML = "";
      for (const c of ps.combatants) {
        const el = document.createElement("div");
        const yourTurn = c.isSelf && c.id === active;
        const isMonster = c.isPlayer !== true;
        const isSelf = c.isSelf === true;
        const showAc = isSelf || c.isPlayer;
        const hpText = "<div class='" + hpClass(c.hpLabel) + "'>" + esc(c.hpLabel) + "</div>";
        const selfHealth = isSelf
          ? "<span class='self-health'>" +
              "<span class='heart-badge'><svg viewBox='0 0 32 32' aria-hidden='true'><path d='M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z'></path></svg></span>" +
              "<span>" + esc(c.hpCurrent ?? "-") + "/" + esc(c.hpMax ?? "-") + "</span>" +
              "<span class='self-health-temp'>+" + esc(c.tempHp ?? 0) + "</span>" +
            "</span>"
          : "";
        el.className = "combatant" + (c.id === active ? " active" : "") + (isSelf ? " is-self" : "") + (yourTurn ? " is-your-turn" : "");
        el.dataset.combatantId = c.id;
        el.innerHTML =
          initiativeMarkup(c.initiative ?? "-") +
          "<div class='name-block'><div class='name'>" + esc(c.name) + "</div>" + hpText + "</div>" +
          "<div class='tail'>" +
            selfHealth +
            (showAc ? shieldMarkup(c.ac ?? "-", false) : shieldMarkup("-", true)) +
            (isMonster ? "<span class='subtle'>monster</span>" : "") +
          "</div>";
        listEl.appendChild(el);
      }
      const nextOrderKey = ps.combatants.map((combatant) => combatant.id).join("|");
      const orderChanged = hasRenderedCombatants && previousCombatantOrderKey !== nextOrderKey;
      const nextRects = new Map();
      for (const node of listEl.children) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const id = node.dataset.combatantId;
        if (!id) {
          continue;
        }
        nextRects.set(id, node.getBoundingClientRect());
      }

      for (const node of listEl.children) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const id = node.dataset.combatantId;
        if (!id) {
          continue;
        }
        const previousRect = previousRects.get(id);
        if (!previousRect) {
          if (hasRenderedCombatants) {
            node.animate(
              [
                { opacity: 0, transform: "translateY(8px) scale(0.985)" },
                { opacity: 1, transform: "translateY(0) scale(1)" },
              ],
              { duration: 190, easing: "cubic-bezier(0.2, 0, 0, 1)" },
            );
          }
          continue;
        }
        if (!orderChanged) {
          continue;
        }
        const currentRect = nextRects.get(id);
        if (!currentRect) {
          continue;
        }
        const deltaX = previousRect.left - currentRect.left;
        const deltaY = previousRect.top - currentRect.top;
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          continue;
        }
        node.animate(
          [
            { transform: "translate(" + deltaX + "px, " + deltaY + "px)" },
            { transform: "translate(0, 0)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      }

      if (hasRenderedCombatants) {
        for (const id of previousIds) {
          if (nextRects.has(id)) {
            continue;
          }
          const oldNode = previousElements.get(id);
          const oldRect = previousRects.get(id);
          if (!oldNode || !oldRect) {
            continue;
          }
          const ghost = oldNode.cloneNode(true);
          if (!(ghost instanceof HTMLElement)) {
            continue;
          }
          ghost.style.position = "fixed";
          ghost.style.left = oldRect.left + "px";
          ghost.style.top = oldRect.top + "px";
          ghost.style.width = oldRect.width + "px";
          ghost.style.height = oldRect.height + "px";
          ghost.style.margin = "0";
          ghost.style.pointerEvents = "none";
          ghost.style.zIndex = "1000";
          document.body.appendChild(ghost);
          const animation = ghost.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "translateY(-4px) scale(0.985)" },
            ],
            { duration: 170, easing: "ease-out" },
          );
          animation.addEventListener("finish", () => {
            ghost.remove();
          });
        }
      }
      previousCombatantOrderKey = nextOrderKey;
      hasRenderedCombatants = true;

      if (active && lastActiveCombatantId !== active) {
        const activeRow = listEl.querySelector('[data-combatant-id="' + active + '"]');
        if (activeRow) {
          scrollRowIntoVisibleArea(activeRow);
        }
      }
      lastActiveCombatantId = active ?? null;
    }

    async function refresh() {
      if (!playerId) return;
      const data = await api("/api/player/state?playerId=" + encodeURIComponent(playerId));
      if (data.ok) render(data.state);
    }

    function startStream() {
      if (!playerId) return;
      if (serverShutDown) return;
      if (stream) {
        stream.close();
      }
      const url = "/api/player/stream?playerId=" + encodeURIComponent(playerId) + "&token=" + encodeURIComponent(token);
      stream = new EventSource(url);
      stream.addEventListener("state_sync", (event) => {
        try {
          const payload = JSON.parse(event.data);
          render(payload);
        } catch {}
      });
      stream.addEventListener("server_shutdown", (event) => {
        serverShutDown = true;
        if (stream) {
          stream.close();
          stream = null;
        }
        const message = (() => {
          try {
            const parsed = JSON.parse(event.data || "{}");
            return parsed.message || "Encounter server has shut down.";
          } catch {
            return "Encounter server has shut down.";
          }
        })();
        statusEl.textContent = message;
        closeInitiativeGate();
        listEl.innerHTML = "";
        renderShutdownScreen();
      });
      stream.onerror = async () => {
        if (serverShutDown) {
          return;
        }
        if (stream) {
          stream.close();
          stream = null;
        }
        await refresh();
        setTimeout(startStream, 1500);
      };
    }

    joinBtn.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name.length) { joinMsg.textContent = "Name is required."; return; }
      const data = await api("/api/player/join", "POST", { name, playerId: playerId || undefined });
      if (!data.ok) { joinMsg.textContent = data.error || "Join failed."; return; }
      playerId = data.player.playerId;
      localStorage.setItem("encounter-cast-player-id", playerId);
      const joinAc = readOptionalInputNumber(joinAcInput);
      const joinHp = readOptionalInputNumber(joinHpInput);
      const joinHpMax = readOptionalInputNumber(joinHpMaxInput);
      const joinTempHp = readOptionalInputNumber(joinTempHpInput);
      const hasOptionalJoinStats = joinAc !== null || joinHp !== null || joinHpMax !== null || joinTempHp !== null;
      if (hasOptionalJoinStats) {
        await api("/api/player/update", "POST", {
          playerId,
          ac: joinAc,
          hpCurrent: joinHp,
          hpMax: joinHpMax,
          tempHp: joinTempHp ?? 0
        });
      }
      joinPanel.style.display = "none";
      appPanel.style.display = "block";
      sheetRoot.style.display = "block";
      if (hasOptionalJoinStats) {
        await refresh();
      } else {
        render(data.state);
      }
      startStream();
    };

    endRoundBtn.onclick = async () => {
      if (!playerId) return;
      await api("/api/player/end-turn", "POST", { playerId });
    };
    initiativeNat1Btn.onclick = () => setInitiativeRollType("nat1");
    initiativeNormalBtn.onclick = () => setInitiativeRollType("normal");
    initiativeNat20Btn.onclick = () => setInitiativeRollType("nat20");
    initiativeGateSubmit.onclick = async () => {
      const initiativeTotal = Number.parseInt(initiativeGateInput.value.trim(), 10);
      if (!Number.isFinite(initiativeTotal)) return;
      await api("/api/player/initiative", "POST", { playerId, initiativeTotal, rollType: initiativeRollType });
      await refresh();
    };
    initiativeGateInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      initiativeGateSubmit.click();
    });

    editModeBtn.onclick = async () => {
      if (sheetMode === "edit") {
        await saveFromSheet();
        return;
      }
      setSheetMode("edit");
    };
    damageModeBtn.onclick = async () => {
      if (sheetMode === "damage") {
        await applyDamageFromSheet();
        return;
      }
      setSheetMode("damage");
    };
    sheetDamage.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      await applyDamageFromSheet();
    });
    sheetDamage.addEventListener("blur", () => {
      setTimeout(() => {
        if (sheetMode !== "damage") {
          return;
        }
        const active = document.activeElement;
        if (active === damageModeBtn || active === sheetDamage) {
          return;
        }
        sheetDamage.value = "";
        setSheetMode("none");
      }, 0);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        ensureDamageActionVisible();
      });
    }
    setSheetMode("none");

    if (playerId) {
      refresh().then(() => {
        joinPanel.style.display = "none";
        appPanel.style.display = "block";
        sheetRoot.style.display = "block";
        startStream();
      });
    }
    window.addEventListener("beforeunload", () => {
      if (!playerId) return;
      if (stream) {
        stream.close();
      }
      navigator.sendBeacon("/api/player/leave?token=" + encodeURIComponent(token), JSON.stringify({ playerId }));
    });
  </script>
</body>
</html>`;
	}
}
