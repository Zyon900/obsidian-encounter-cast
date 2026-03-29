import type { PlayerTheme } from "../player-events";

export interface PlayerClientBootConfig {
	supportUrl: string | null;
	theme: PlayerTheme | null;
}

declare global {
	interface Window {
		__ENCOUNTER_CAST_PLAYER_CONFIG__?: PlayerClientBootConfig;
	}
}
