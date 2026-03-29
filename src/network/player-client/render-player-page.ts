import playerClientCss from "./app.css";
import type { PlayerClientBootConfig } from "./player-runtime";
import type { PlayerTheme } from "../player-events";

export function renderPlayerPageHtml(theme: PlayerTheme | null, supportUrl: string | null): string {
	const config: PlayerClientBootConfig = {
		supportUrl,
		theme,
	};
	const configJson = JSON.stringify(config).split("<").join("\\u003c");

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EncounterCast Player</title>
  <style>${playerClientCss}</style>
</head>
<body>
  <div id="encounter-cast-player-root"></div>
  <script>window.__ENCOUNTER_CAST_PLAYER_CONFIG__ = ${configJson};</script>
  <script src="/player-client.js"></script>
</body>
</html>`;
}
