import type { CombatSession } from "../../../encounter/combat-session";
import type { PlayerFacingState, PlayerPresenceState, PlayerTheme } from "../../player-contracts";

export type HpStatusLabel = "unscathed" | "healthy" | "hurt" | "critically wounded" | "down" | "dead";

export function computeHpStatusLabel(current: number | null, max: number | null, dead = true): HpStatusLabel {
	if (current === null || max === null || max <= 0) {
		return "healthy";
	}
	if (current <= 0) {
		return dead ? "dead" : "down";
	}

	const pct = (current / max) * 100;
	if (pct >= 100) {
		return "unscathed";
	}
	if (pct > 60) {
		return "healthy";
	}
	if (pct > 40) {
		return "hurt";
	}
	return "critically wounded";
}

export function buildPlayerViewState(
	session: CombatSession | null,
	encounterRunning: boolean,
	players: PlayerPresenceState[],
	viewerPlayerId: string,
	theme: PlayerTheme | null,
): PlayerFacingState {
	const combatants = session?.combatants ?? [];
	const visibleCombatants = encounterRunning ? combatants : combatants.filter((combatant) => combatant.isPlayer === true);
	const selfCombatantId = players.find((player) => player.playerId === viewerPlayerId)?.combatantId ?? null;

	return {
		encounterRunning,
		round: session?.round ?? 1,
		activeCombatantId: session?.combatants[session.activeIndex]?.id ?? null,
		combatants: visibleCombatants.map((combatant) => {
			const isSelf = selfCombatantId === combatant.id;
			const deathState = combatant.deathState ?? "normal";
			const dead = deathState === "dead";
			return {
				id: combatant.id,
				name: combatant.name,
				isPlayer: combatant.isPlayer === true,
				initiative: combatant.initiative,
				initiativeRoll: combatant.initiativeRoll,
				initiativeCriticalFailure: combatant.initiativeCriticalFailure,
				hpLabel: computeHpStatusLabel(combatant.hpCurrent, combatant.hpMax, dead),
				deathState,
				deathSaveFailures: combatant.deathSaveFailures ?? 0,
				deathSaveSuccesses: combatant.deathSaveSuccesses ?? 0,
				isSelf,
				hpCurrent: isSelf ? combatant.hpCurrent : null,
				hpMax: isSelf ? combatant.hpMax : null,
				tempHp: isSelf ? combatant.tempHp : 0,
				ac: isSelf ? combatant.ac : null,
			};
		}),
		players,
		theme,
		sessionId: session?.id ?? null,
	};
}
