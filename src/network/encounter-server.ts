import type { Server as HttpServer } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";

export interface EncounterServerState {
	running: boolean;
	port: number | null;
}

export class EncounterServer {
	private httpServer: HttpServer | null = null;
	private wsServer: WebSocketServer | null = null;
	private readonly sockets = new Set<WebSocket>();
	private state: EncounterServerState = { running: false, port: null };

	getState(): EncounterServerState {
		return this.state;
	}

	async start(port = 0): Promise<EncounterServerState> {
		if (this.httpServer && this.wsServer) {
			return this.state;
		}

		const [{ default: express }, httpModule, wsModule] = await Promise.all([
			import("express"),
			import("node:http"),
			import("ws"),
		]);

		const app = express();
		app.get("/health", (_req, res) => {
			res.json({ ok: true });
		});

		const httpServer = httpModule.createServer(app);
		const wsServer = new wsModule.WebSocketServer({ server: httpServer, path: "/ws" });
		wsServer.on("connection", (socket) => {
			this.sockets.add(socket);
			socket.on("close", () => {
				this.sockets.delete(socket);
			});
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
		};

		return this.state;
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
		};
	}
}