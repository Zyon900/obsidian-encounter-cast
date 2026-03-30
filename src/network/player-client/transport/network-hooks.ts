import { useEffect } from "preact/hooks";
import type { StateSyncPayload } from "../../player-contracts";
import { createPlayerEventStream } from "./sse-stream";

interface UsePlayerEventStreamOptions {
	token: string;
	playerId: string;
	enabled: boolean;
	reconnectNonce: number;
	onStateSync: (state: StateSyncPayload) => void;
	onServerShutdown: (message: string) => void;
	onPlayerKicked: (message: string) => void;
	onDisconnected: () => Promise<void>;
	onReconnectScheduled: () => void;
}

export function usePlayerEventStream(options: UsePlayerEventStreamOptions): void {
	const {
		token,
		playerId,
		enabled,
		reconnectNonce,
		onStateSync,
		onServerShutdown,
		onPlayerKicked,
		onDisconnected,
		onReconnectScheduled,
	} = options;

	useEffect(() => {
		if (!enabled) {
			return;
		}
		let closed = false;
		const stream = createPlayerEventStream(token, playerId, {
			onStateSync,
			onServerShutdown,
			onPlayerKicked,
			onDisconnected: () => {
				if (closed) {
					return;
				}
				stream.close();
				void onDisconnected().finally(() => {
					window.setTimeout(() => {
						onReconnectScheduled();
					}, 1500);
				});
			},
		});
		return () => {
			closed = true;
			stream.close();
		};
	}, [
		enabled,
		onDisconnected,
		onPlayerKicked,
		onReconnectScheduled,
		onServerShutdown,
		onStateSync,
		playerId,
		reconnectNonce,
		token,
	]);
}
