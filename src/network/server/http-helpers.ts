import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";

export function applySecurityHeaders(res: ServerResponse): void {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "no-referrer");
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
	const body = JSON.stringify(payload);
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(body);
}

export function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.end(html);
}

export function sendJavascript(res: ServerResponse, statusCode: number, script: string): void {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "application/javascript; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(script);
}

export function sendSvg(res: ServerResponse, statusCode: number, svg: string): void {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
	res.setHeader("Cache-Control", "no-store");
	res.end(svg);
}

export function readQuery(url: string | undefined): URLSearchParams {
	if (!url) {
		return new URLSearchParams();
	}
	return new URL(url, "http://encounter-cast.local").searchParams;
}

export function readPathname(url: string | undefined): string {
	if (!url) {
		return "";
	}
	return new URL(url, "http://encounter-cast.local").pathname;
}

export function readHeaderToken(authorization: string | string[] | undefined): string | null {
	const header = Array.isArray(authorization) ? authorization[0] : authorization;
	if (!header) {
		return null;
	}

	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim() ?? null;
}

export function matchesToken(candidate: string | null, token: string): boolean {
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

export function isAuthorizedRequest(req: IncomingMessage, token: string): boolean {
	const queryToken = readQuery(req.url).get("token");
	const headerToken = readHeaderToken(req.headers.authorization);
	return matchesToken(queryToken, token) || matchesToken(headerToken, token);
}

export function resolveInviteUrl(req: IncomingMessage, token: string, inviteUrls: string[]): string {
	const hostHeader = typeof req.headers.host === "string" ? req.headers.host.trim() : "";
	if (hostHeader.length > 0) {
		return `http://${hostHeader}/?token=${encodeURIComponent(token)}`;
	}
	return inviteUrls[0] ?? `http://127.0.0.1/?token=${encodeURIComponent(token)}`;
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
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

export function buildInviteUrls(port: number, token: string): string[] {
	const urls = new Set<string>();
	for (const address of getIpv4Addresses()) {
		urls.add(`http://${address}:${port}/?token=${token}`);
	}
	return Array.from(urls);
}

function getIpv4Addresses(): string[] {
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
