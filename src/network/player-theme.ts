import type { PluginManifest } from "obsidian";
import type { PlayerTheme } from "./player-contracts";

export function captureObsidianTheme(): PlayerTheme | null {
	if (typeof document === "undefined") {
		return null;
	}

	const rootStyles = window.getComputedStyle(document.documentElement);
	const bodyStyles = document.body ? window.getComputedStyle(document.body) : null;
	const read = (name: string) => {
		const bodyValue = bodyStyles?.getPropertyValue(name).trim() ?? "";
		if (bodyValue.length) {
			return bodyValue;
		}
		return rootStyles.getPropertyValue(name).trim();
	};

	return {
		backgroundPrimary: read("--background-primary"),
		backgroundSecondary: read("--background-secondary"),
		textNormal: read("--text-normal"),
		textMuted: read("--text-muted"),
		textError: read("--text-error"),
		textSuccess: read("--text-success"),
		textWarning: read("--text-warning"),
		textFaint: read("--text-faint"),
		interactiveAccent: read("--interactive-accent"),
		textOnAccent: read("--text-on-accent"),
		border: read("--background-modifier-border"),
	};
}

export function resolveSupportUrlFromManifest(manifest: PluginManifest): string | null {
	const candidateFunding = (manifest as { fundingUrl?: unknown }).fundingUrl;
	if (typeof candidateFunding === "string" && candidateFunding.trim().length > 0) {
		return candidateFunding.trim();
	}
	if (candidateFunding && typeof candidateFunding === "object") {
		const values = Object.values(candidateFunding as Record<string, unknown>);
		for (const value of values) {
			if (typeof value === "string" && value.trim().length > 0) {
				return value.trim();
			}
		}
	}

	const candidateAuthorUrl = (manifest as { authorUrl?: unknown }).authorUrl;
	if (typeof candidateAuthorUrl === "string" && candidateAuthorUrl.trim().length > 0) {
		return candidateAuthorUrl.trim();
	}

	return null;
}
