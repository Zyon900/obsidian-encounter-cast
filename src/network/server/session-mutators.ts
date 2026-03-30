import {
	advanceCombatTurn,
	markCombatantDead,
	markCombatantStabilized,
	setActiveToTopCombatant,
	setCombatantAc,
	setCombatantDeathSaves,
	setCombatantHp,
	setCombatantHpMax,
	setCombatantInitiative,
	setCombatantTempHp,
	type CombatSession,
} from "../../encounter/combat-session";
import type {
	CombatantId,
	EndTurnPayload,
	InitiativeSubmitPayload,
	PlayerDeathSavesPayload,
	PlayerId,
	PlayerUpdatePayload,
} from "../player-contracts";

export function findPlayerCombatant(session: CombatSession, playerId: string): { id: CombatantId } | null {
	const combatant = session.combatants.find((candidate) => candidate.monster.id === `player::${playerId}`) ?? null;
	return combatant ? { id: combatant.id } : null;
}

export function removeCombatantFromSession(session: CombatSession, combatantId: string): CombatSession {
	const currentIndex = session.combatants.findIndex((candidate) => candidate.id === combatantId);
	if (currentIndex === -1) {
		return session;
	}

	const nextCombatants = session.combatants.filter((candidate) => candidate.id !== combatantId);
	const nextActiveIndex = nextCombatants.length === 0
		? 0
		: session.activeIndex > currentIndex
			? session.activeIndex - 1
			: Math.min(session.activeIndex, nextCombatants.length - 1);

	return {
		...session,
		combatants: nextCombatants,
		activeIndex: nextActiveIndex,
		round: nextCombatants.length > 0 ? session.round : 1,
		updatedAt: new Date().toISOString(),
	};
}

export function applyInitiativeSubmit(
	session: CombatSession | null,
	encounterRunning: boolean,
	playerCombatantId: string | null,
	payload: InitiativeSubmitPayload,
): CombatSession | null {
	if (!session || !playerCombatantId) {
		return session;
	}

	const total = Number.isFinite(payload.initiativeTotal) ? Math.trunc(payload.initiativeTotal) : NaN;
	if (!Number.isFinite(total)) {
		return session;
	}

	const shouldFollowTopOnOpeningTurn = encounterRunning && session.round === 1 && session.activeIndex === 0;
	const rollType =
		payload.rollType === "nat1" || payload.rollType === "nat20" || payload.rollType === "normal"
			? payload.rollType
			: "normal";
	let next = setCombatantInitiative(session, playerCombatantId, total, rollType);
	if (shouldFollowTopOnOpeningTurn) {
		next = setActiveToTopCombatant(next);
	}
	return next;
}

export function applyPlayerUpdate(
	session: CombatSession | null,
	playerCombatantId: string | null,
	payload: PlayerUpdatePayload,
): CombatSession | null {
	if (!session || !playerCombatantId) {
		return session;
	}

	let next = session;
	if (payload.hpCurrent !== undefined) {
		next = setCombatantHp(next, playerCombatantId, payload.hpCurrent);
	}
	if (payload.hpMax !== undefined) {
		next = setCombatantHpMax(next, playerCombatantId, payload.hpMax);
	}
	if (payload.tempHp !== undefined) {
		next = setCombatantTempHp(next, playerCombatantId, Math.max(0, Math.trunc(payload.tempHp)));
	}
	if (payload.ac !== undefined) {
		next = setCombatantAc(next, playerCombatantId, payload.ac);
	}
	return next;
}

export function applyPlayerDeathSaves(
	session: CombatSession | null,
	playerCombatantId: string | null,
	payload: PlayerDeathSavesPayload,
): CombatSession | null {
	if (!session || !playerCombatantId) {
		return session;
	}

	const combatant = session.combatants.find((candidate) => candidate.id === playerCombatantId) ?? null;
	if (!combatant || combatant.isPlayer !== true || combatant.deathState !== "down") {
		return session;
	}

	if (payload.confirm === "dead") {
		return markCombatantDead(session, playerCombatantId);
	}
	if (payload.confirm === "saved") {
		return markCombatantStabilized(session, playerCombatantId);
	}

	const successes = Number.isFinite(payload.successes) ? Math.trunc(payload.successes ?? 0) : 0;
	const failures = Number.isFinite(payload.failures) ? Math.trunc(payload.failures ?? 0) : 0;
	return setCombatantDeathSaves(session, playerCombatantId, successes, failures);
}

export function applyEndTurn(
	session: CombatSession | null,
	encounterRunning: boolean,
	playerCombatantId: string | null,
	payload: EndTurnPayload,
): CombatSession | null {
	if (!session || !encounterRunning || !playerCombatantId || !payload.playerId) {
		return session;
	}

	const active = session.combatants[session.activeIndex];
	if (!active || active.id !== playerCombatantId) {
		return session;
	}

	return advanceCombatTurn(session);
}

export function resolvePlayerCombatantId(players: Map<PlayerId, { combatantId: string }>, playerId: string): string | null {
	return players.get(playerId)?.combatantId ?? null;
}
