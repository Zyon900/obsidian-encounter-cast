import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { CombatSession } from "../encounter/combat-session";
import type { WebSocket, WebSocketServer } from "ws";

export interface EncounterServerState {
	running: boolean;
	port: number | null;
	roomToken: string | null;
	inviteUrls: string[];
}

interface EncounterServerEventMap {
	state_sync: {
		session: CombatSession | null;
	};
}

export class EncounterServer {
	private httpServer: HttpServer | null = null;
	private wsServer: WebSocketServer | null = null;
	private readonly sockets = new Set<WebSocket>();
	private state: EncounterServerState = {
		running: false,
		port: null,
		roomToken: null,
		inviteUrls: [],
	};
	private activeSession: CombatSession | null = null;

	getState(): EncounterServerState {
		return {
			...this.state,
			inviteUrls: [...this.state.inviteUrls],
		};
	}

	async start(port = 0): Promise<EncounterServerState> {
		if (this.httpServer && this.wsServer) {
			return this.getState();
		}

		const [{ default: express }, httpModule, wsModule] = await Promise.all([
			import("express"),
			import("node:http"),
			import("ws"),
		]);
		const token = randomBytes(16).toString("hex");
		const app = express();

		app.get("/health", (_req, res) => {
			res.json({ ok: true });
		});

		app.use((req, res, next) => {
			if (this.isAuthorizedRequest(req, token)) {
				next();
				return;
			}

			res.status(401).json({ ok: false, error: "Invalid or missing room token." });
		});

		app.get("/api/session", (_req, res) => {
			res.json({
				ok: true,
				session: this.activeSession,
			});
		});

		const httpServer = httpModule.createServer(app);
		const wsServer = new wsModule.WebSocketServer({ noServer: true });

		httpServer.on("upgrade", (request, socket, head) => {
			if (!this.isAuthorizedUpgrade(request, token)) {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
				return;
			}

			const pathname = this.readPathname(request.url);
			if (pathname !== "/ws") {
				socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
				socket.destroy();
				return;
			}

			wsServer.handleUpgrade(request, socket, head, (wsSocket) => {
				wsServer.emit("connection", wsSocket, request);
			});
		});

		wsServer.on("connection", (socket) => {
			this.sockets.add(socket);
			socket.on("close", () => {
				this.sockets.delete(socket);
			});
			this.send(socket, "state_sync", { session: this.activeSession });
		});

		await new Promise<void>((resolve, reject) => {
			httpServer.once("error", reject);
			httpServer.listen(port, "0.0.0.0", () => resolve());
		});

		const address = httpServer.address();
		const actualPort = typeof address === "object" && address ? address.port : null;

		this.httpServer = httpServer;
		this.wsServer = wsServer;
		this.state = {
			running: true,
			port: actualPort,
			roomToken: token,
			inviteUrls: actualPort === null ? [] : this.buildInviteUrls(actualPort, token),
		};

		return this.getState();
	}

	async stop(): Promise<void> {
		for (const socket of this.sockets) {
			socket.close(1001, "EncounterCast shutting down");
		}
		this.sockets.clear();

		if (this.wsServer) {
			const wsServer = this.wsServer;
			await new Promise<void>((resolve) => wsServer.close(() => resolve()));
			this.wsServer = null;
		}

		if (this.httpServer) {
			const httpServer = this.httpServer;
			await new Promise<void>((resolve) => httpServer.close(() => resolve()));
			this.httpServer = null;
		}

		this.state = {
			running: false,
			port: null,
			roomToken: null,
			inviteUrls: [],
		};
	}

	setSession(session: CombatSession | null): void {
		this.activeSession = session;
		this.broadcast("state_sync", { session });
	}

	private isAuthorizedRequest(
		req: IncomingMessage & {
			headers: IncomingMessage["headers"];
			url?: string;
			query?: Record<string, unknown>;
		},
		token: string,
	): boolean {
		const queryToken = this.readQueryToken(req.url);
		const headerToken = this.readHeaderToken(req.headers.authorization);
		return queryToken === token || headerToken === token;
	}

	private isAuthorizedUpgrade(request: IncomingMessage, token: string): boolean {
		const queryToken = this.readQueryToken(request.url);
		const headerToken = this.readHeaderToken(request.headers.authorization);
		return queryToken === token || headerToken === token;
	}

	private readHeaderToken(authorization: string | string[] | undefined): string | null {
		const header = Array.isArray(authorization) ? authorization[0] : authorization;
		if (!header) {
			return null;
		}

		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		return match?.[1]?.trim() ?? null;
	}

	private readQueryToken(url: string | undefined): string | null {
		if (!url) {
			return null;
		}

		return new URL(url, "http://encounter-cast.local").searchParams.get("token");
	}

	private readPathname(url: string | undefined): string {
		if (!url) {
			return "";
		}

		return new URL(url, "http://encounter-cast.local").pathname;
	}

	private send<EventName extends keyof EncounterServerEventMap>(
		socket: WebSocket,
		type: EventName,
		payload: EncounterServerEventMap[EventName],
	): void {
		socket.send(JSON.stringify({ type, payload }));
	}

	private broadcast<EventName extends keyof EncounterServerEventMap>(
		type: EventName,
		payload: EncounterServerEventMap[EventName],
	): void {
		for (const socket of this.sockets) {
			this.send(socket, type, payload);
		}
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
