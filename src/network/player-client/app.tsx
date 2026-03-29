import { render } from "preact";
import { useEffect } from "preact/hooks";
import { bootPlayerClient, type PlayerClientBootConfig } from "./player-runtime";
import { PlayerPageShell } from "./player-page-shell";

declare global {
	interface Window {
		__ENCOUNTER_CAST_PLAYER_CONFIG__?: PlayerClientBootConfig;
	}
}

function PlayerClientApp() {
	useEffect(() => {
		bootPlayerClient(window.__ENCOUNTER_CAST_PLAYER_CONFIG__ ?? { supportUrl: null, theme: null });
	}, []);
	return <PlayerPageShell />;
}

const root = document.getElementById("encounter-cast-player-root");
if (root) {
	render(<PlayerClientApp />, root);
}
