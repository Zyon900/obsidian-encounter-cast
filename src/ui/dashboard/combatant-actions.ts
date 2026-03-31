import type { CombatSession } from "../../encounter/combat-session";

export function removeCombatantFromSession(session: CombatSession, combatantId: string): CombatSession | null {
	const currentIndex = session.combatants.findIndex((candidate) => candidate.id === combatantId);
	if (currentIndex === -1) {
		return null;
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

export function applyDamageHealToCombatants(
	session: CombatSession,
	combatantIds: string[],
	amount: number,
): {
	session: CombatSession;
	affectedCount: number;
	skippedCount: number;
	changed: boolean;
} {
	const selectedIds = new Set(combatantIds);
	let affectedCount = 0;
	let skippedCount = 0;
	let changed = false;

	const nextCombatants = session.combatants.map((combatant) => {
		if (!selectedIds.has(combatant.id) || combatant.isPlayer === true) {
			return combatant;
		}
		if (combatant.hpCurrent === null || combatant.hpMax === null) {
			skippedCount += 1;
			return combatant;
		}

		const hpMax = Math.max(0, combatant.hpMax);
		const hpCurrent = Math.max(0, Math.min(combatant.hpCurrent, hpMax));
		const tempHpCurrent = Math.max(0, combatant.tempHp);
		let nextHpCurrent = hpCurrent;
		let nextTempHp = tempHpCurrent;
		if (amount > 0) {
			const damageRemainingAfterTemp = Math.max(0, amount - tempHpCurrent);
			nextTempHp = Math.max(0, tempHpCurrent - amount);
			nextHpCurrent = Math.max(0, hpCurrent - damageRemainingAfterTemp);
		} else {
			nextHpCurrent = Math.min(hpMax, hpCurrent + Math.abs(amount));
		}
		affectedCount += 1;
		if (
			nextHpCurrent !== combatant.hpCurrent ||
			nextTempHp !== combatant.tempHp ||
			hpCurrent !== combatant.hpCurrent ||
			tempHpCurrent !== combatant.tempHp ||
			hpMax !== combatant.hpMax
		) {
			changed = true;
		}
		return {
			...combatant,
			hpCurrent: nextHpCurrent,
			tempHp: nextTempHp,
			hpMax,
		};
	});

	return {
		session: {
			...session,
			combatants: nextCombatants,
			updatedAt: new Date().toISOString(),
		},
		affectedCount,
		skippedCount,
		changed,
	};
}
