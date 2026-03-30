import { useEffect } from "preact/hooks";
import type { PlayerClientBootConfig } from "../player-config";

export function useThemeVars(theme: PlayerClientBootConfig["theme"]): void {
	useEffect(() => {
		if (!theme) {
			return;
		}
		const root = document.documentElement;
		root.style.setProperty("--ec-background-primary", theme.backgroundPrimary);
		root.style.setProperty("--ec-background-secondary", theme.backgroundSecondary);
		root.style.setProperty("--ec-text-normal", theme.textNormal);
		root.style.setProperty("--ec-text-muted", theme.textMuted);
		root.style.setProperty("--ec-text-error", theme.textError);
		root.style.setProperty("--ec-text-success", theme.textSuccess);
		root.style.setProperty("--ec-text-warning", theme.textWarning);
		root.style.setProperty("--ec-text-faint", theme.textFaint);
		root.style.setProperty("--ec-interactive-accent", theme.interactiveAccent);
		root.style.setProperty("--ec-text-on-accent", theme.textOnAccent);
		root.style.setProperty("--ec-border", theme.border);
	}, [theme]);
}
