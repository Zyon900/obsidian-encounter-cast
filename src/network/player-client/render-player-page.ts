import playerClientCss from "./app.css";
import playerPageBodyHtml from "./player-page-body.html";
import {
	bootPlayerClient,
	PLAYER_CLIENT_RUNTIME_HELPERS,
	type PlayerClientBootConfig,
} from "./player-runtime";
import type { PlayerTheme } from "../player-events";

export function renderPlayerPageHtml(theme: PlayerTheme | null, supportUrl: string | null): string {
	// Serialize config into the page so the browser client can boot without extra network bootstrap calls.
	const config: PlayerClientBootConfig = {
		supportUrl,
		theme,
	};
	const configJson = JSON.stringify(config).split("<").join("\\u003c");
	const runtimeSource = bootPlayerClient.toString();
	const helperSource = PLAYER_CLIENT_RUNTIME_HELPERS.map((helper) => helper.toString()).join("\n");
	const inlineScript = `${helperSource}\n(${runtimeSource})(${configJson});`;

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EncounterCast Player</title>
  <style>${playerClientCss}</style>
</head>
<body>
${playerPageBodyHtml}
  <script>${inlineScript}</script>
</body>
</html>`;
}
