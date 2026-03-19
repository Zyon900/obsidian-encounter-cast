import type { MonsterRecord } from "../monsters/types";
import type { ResolvedEncounterEntry } from "./encounter-resolver";

export interface Combatant {
	id: string;
	name: string;
	monsterName: string;
	challenge: string | null;
	hpCurrent: number | null;
	hpMax: number | null;
	ac: number | null;
	dex: number | null;
	initiative: number | null;
	monster: MonsterRecord;
}

export interface CombatSession {
	id: string;
	title: string | null;
	round: number;
	activeIndex: number;
	combatants: Combatant[];
	createdAt: string;
	updatedAt: string;
}

export function createCombatSession(title: string | null, entries: ResolvedEncounterEntry[]): CombatSession {
	const createdAt = new Date().toISOString();
	return {
		id: `session-${Date.now().toString(36)}`,
		title,
		round: 1,
		activeIndex: 0,
		combatants: expandCombatants(entries),
		createdAt,
		updatedAt: createdAt,
	};
}

export function addCombatantsToSession(
	session: CombatSession,
	title: string | null,
	entries: ResolvedEncounterEntry[],
): CombatSession {
	const combatants = session.combatants.concat(expandCombatants(entries, session.combatants));
	return stamp({
		...session,
		title: session.title ?? title,
		combatants,
	});
}

export function advanceCombatTurn(session: CombatSession): CombatSession {
	if (session.combatants.length === 0) {
		return session;
	}

	const nextIndex = (session.activeIndex + 1) % session.combatants.length;
	const round = nextIndex === 0 ? session.round + 1 : session.round;
	return stamp({
		...session,
		activeIndex: nextIndex,
		round,
	});
}

export function moveCombatant(session: CombatSession, combatantId: string, targetIndex: number): CombatSession {
	const sourceIndex = session.combatants.findIndex((combatant) => combatant.id === combatantId);
	if (sourceIndex === -1) {
		return session;
	}

	const boundedIndex = Math.max(0, Math.min(targetIndex, session.combatants.length - 1));
	if (boundedIndex === sourceIndex) {
		return session;
	}

	const combatants = session.combatants.slice();
	const [moved] = combatants.splice(sourceIndex, 1);
	if (!moved) {
		return session;
	}
	combatants.splice(boundedIndex, 0, moved);

	let activeIndex = session.activeIndex;
	if (session.activeIndex === sourceIndex) {
		activeIndex = boundedIndex;
	} else if (sourceIndex < session.activeIndex && boundedIndex >= session.activeIndex) {
		activeIndex -= 1;
	} else if (sourceIndex > session.activeIndex && boundedIndex <= session.activeIndex) {
		activeIndex += 1;
	}

	return stamp({
		...session,
		activeIndex,
		combatants,
	});
}

export function setCombatantHp(session: CombatSession, combatantId: string, hpCurrent: number | null): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => ({
		...combatant,
		hpCurrent: hpCurrent === null ? null : Math.max(0, hpCurrent),
	}));
}

export function setCombatantAc(session: CombatSession, combatantId: string, ac: number | null): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => ({
		...combatant,
		ac: ac === null ? null : Math.max(0, ac),
	}));
}

export function setActiveCombatant(session: CombatSession, combatantId: string): CombatSession {
	const nextIndex = session.combatants.findIndex((combatant) => combatant.id === combatantId);
	if (nextIndex === -1 || nextIndex === session.activeIndex) {
		return session;
	}

	return stamp({
		...session,
		activeIndex: nextIndex,
	});
}

function updateCombatant(
	session: CombatSession,
	combatantId: string,
	update: (combatant: Combatant) => Combatant,
): CombatSession {
	let changed = false;
	const combatants = session.combatants.map((combatant) => {
		if (combatant.id !== combatantId) {
			return combatant;
		}

		changed = true;
		return update(combatant);
	});

	return changed ? stamp({ ...session, combatants }) : session;
}

function expandCombatants(entries: ResolvedEncounterEntry[], existingCombatants: Combatant[] = []): Combatant[] {
	const counters = buildNameCounters(existingCombatants);
	const combatants: Combatant[] = [];

	for (const item of entries) {
		for (let copyIndex = 0; copyIndex < item.entry.quantity; copyIndex++) {
			const monsterName = item.monster.name;
			const baseName = item.entry.customName ?? monsterName;
			const displayName = item.entry.customName ? baseName : nextUnnamedMonsterLabel(monsterName, counters);
			const idSeed = `${item.monster.id}-${item.entry.line}-${existingCombatants.length + combatants.length + 1}`;
			combatants.push({
				id: `combatant-${idSeed}`,
				name: displayName,
				monsterName,
				challenge: item.monster.challenge,
				hpCurrent: item.monster.hp,
				hpMax: item.monster.hp,
				ac: item.monster.ac,
				dex: item.monster.dex,
				initiative: null,
				monster: item.monster,
			});
		}
	}

	return combatants;
}

function buildNameCounters(existingCombatants: Combatant[]): Map<string, number> {
	const counters = new Map<string, number>();
	for (const combatant of existingCombatants) {
		const current = counters.get(combatant.monsterName) ?? 0;
		counters.set(combatant.monsterName, current + 1);
	}
	return counters;
}

function nextUnnamedMonsterLabel(monsterName: string, counters: Map<string, number>): string {
	const next = (counters.get(monsterName) ?? 0) + 1;
	counters.set(monsterName, next);
	return `${monsterName} ${indexToAlphaSuffix(next)}`;
}

function indexToAlphaSuffix(index: number): string {
	let current = index;
	let label = "";
	while (current > 0) {
		current -= 1;
		label = String.fromCharCode(65 + (current % 26)) + label;
		current = Math.floor(current / 26);
	}
	return label;
}

function stamp(session: CombatSession): CombatSession {
	return {
		...session,
		updatedAt: new Date().toISOString(),
	};
}
