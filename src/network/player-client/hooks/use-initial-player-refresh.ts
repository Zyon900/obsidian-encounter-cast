import { useEffect } from "preact/hooks";

export function useInitialPlayerRefresh(playerId: string, refreshState: () => Promise<void>): void {
	useEffect(() => {
		if (!playerId) {
			return;
		}
		void refreshState();
	}, [playerId, refreshState]);
}
