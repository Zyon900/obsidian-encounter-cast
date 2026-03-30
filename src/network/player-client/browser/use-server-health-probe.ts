/* eslint-disable no-restricted-globals */
import { useEffect } from "preact/hooks";

export function useServerHealthProbe(enabled: boolean, token: string, onServerShutdown: () => void): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const check = async () => {
			try {
				const response = await fetch(`/api/session?token=${encodeURIComponent(token)}`, { cache: "no-store" });
				if (!response.ok) {
					throw new Error("Health endpoint unavailable.");
				}
			} catch {
				onServerShutdown();
			}
		};
		void check();
		const timer = window.setInterval(() => void check(), 3000);
		return () => clearInterval(timer);
	}, [enabled, onServerShutdown, token]);
}
