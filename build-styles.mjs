import { readFileSync, writeFileSync } from "node:fs";
import { syncPluginBuildOutputs } from "./sync-build-to-vault.mjs";

export const orderedSources = [
	"src/styles/status.css",
	"src/styles/encounter.css",
	"src/styles/dashboard.css",
	"src/styles/hover-preview.css",
];

const header = [
	"/*",
	" * GENERATED FILE. Do not edit directly.",
	" * Source styles live in src/styles/*.css",
	" */",
	"",
].join("\n");

export function buildStyles() {
	const body = orderedSources
		.map((path) => {
			const css = readFileSync(path, "utf8").trim();
			return `/* ${path} */\n${css}`;
		})
		.join("\n\n");

	writeFileSync("styles.css", `${header}${body}\n`, "utf8");
	syncPluginBuildOutputs({ reason: "styles" });
}

buildStyles();
