import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import type { CombatSession } from "../encounter/combat-session";

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
			this.handleRequest(req, res, token);
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
	}

	private handleRequest(req: IncomingMessage, res: ServerResponse, token: string): void {
		this.applySecurityHeaders(res);
		const pathname = this.readPathname(req.url);
		if (pathname === "/health") {
			this.sendJson(res, 200, { ok: true });
			return;
		}

		if (!this.isAuthorizedRequest(req, token)) {
			this.sendJson(res, 401, { ok: false, error: "Invalid or missing room token." });
			return;
		}

		if (pathname === "/api/session") {
			this.sendJson(res, 200, {
				ok: true,
				session: this.activeSession,
			});
			return;
		}

		if (pathname === "/") {
			this.sendHtml(
				res,
				200,
				`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>EncounterCast</title>
</head>
<body>
	<p>this is a test</p>
</body>
</html>`,
			);
			return;
		}

		this.sendJson(res, 404, { ok: false, error: "Not found." });
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
		const queryToken = this.readQueryToken(req.url);
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
