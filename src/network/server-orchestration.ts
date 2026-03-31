import type { CombatSession } from "../encounter/combat-session";
import type { CombatServer, CombatServerState } from "./combat-server";
import type { PlayerTheme } from "./player-contracts";

interface ApplyCombatServerRuntimeStateArgs {
	theme: PlayerTheme | null;
	supportUrl: string | null;
	encounterRunning: boolean;
	session: CombatSession | null;
}

export function applyCombatServerRuntimeState(
	server: CombatServer,
	args: ApplyCombatServerRuntimeStateArgs,
): void {
	server.setTheme(args.theme);
	server.setSupportUrl(args.supportUrl);
	server.setEncounterRunning(args.encounterRunning);
	server.setSession(args.session);
}

export function buildEncounterServerStartSummary(state: CombatServerState): string {
	const invite = state.inviteUrls[0];
	return invite
		? `Encounter server started on port ${state.port ?? "?"}. ${invite}`
		: `Encounter server started on port ${state.port ?? "?"}.`;
}
