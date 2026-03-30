import { useEffect } from "preact/hooks";

export function usePlayerLeaveBeacon(token: string, playerId: string | null): void {
	useEffect(() => {
		if (!playerId) {
			return;
		}
		return () => {
			navigator.sendBeacon(`/api/player/leave?token=${encodeURIComponent(token)}`, JSON.stringify({ playerId }));
		};
	}, [token, playerId]);
}
