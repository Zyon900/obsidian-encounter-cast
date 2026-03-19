import { readFileSync, writeFileSync } from "node:fs";

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
}

buildStyles();
