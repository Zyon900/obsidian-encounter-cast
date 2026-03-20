import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const OUTPUT_FILES = ["main.js", "styles.css", "manifest.json"];

function parseDotEnv(content) {
	const parsed = {};

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const equalIndex = line.indexOf("=");
		if (equalIndex <= 0) {
			continue;
		}

		const key = line.slice(0, equalIndex).trim();
		let value = line.slice(equalIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
}

function loadEnvFile() {
	if (!existsSync(".env")) {
		return {};
	}

	return parseDotEnv(readFileSync(".env", "utf8"));
}

function normalizePluginsDir(rawPath) {
	if (!rawPath) {
		return "";
	}

	const trimmed = rawPath.trim();
	if (!trimmed) {
		return "";
	}

	const windowsPathMatch = /^([A-Za-z]):[\\/](.*)$/.exec(trimmed);
	if (windowsPathMatch) {
		const [, drive, rest] = windowsPathMatch;
		const normalizedRest = rest.replace(/\\/g, "/");
		return path.posix.normalize(`/mnt/${drive.toLowerCase()}/${normalizedRest}`);
	}

	return trimmed;
}

function readPluginId() {
	const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
	if (!manifest.id || typeof manifest.id !== "string") {
		throw new Error("manifest.json is missing a valid string id");
	}
	return manifest.id;
}

export function syncPluginBuildOutputs({ reason = "build", quietIfUnset = true } = {}) {
	const env = loadEnvFile();
	const pluginsDir = normalizePluginsDir(
		process.env.OBSIDIAN_PLUGINS_DIR || env.OBSIDIAN_PLUGINS_DIR || "",
	);

	if (!pluginsDir) {
		if (!quietIfUnset) {
			console.log("[sync] OBSIDIAN_PLUGINS_DIR is not set; skipping vault copy");
		}
		return;
	}

	const pluginId = readPluginId();
	const destinationDir = path.join(pluginsDir, pluginId);
	mkdirSync(destinationDir, { recursive: true });

	const copied = [];
	for (const filename of OUTPUT_FILES) {
		if (!existsSync(filename)) {
			continue;
		}
		copyFileSync(filename, path.join(destinationDir, filename));
		copied.push(filename);
	}

	if (copied.length > 0) {
		console.log(`[sync] ${reason}: copied ${copied.join(", ")} -> ${destinationDir}`);
	}
}
