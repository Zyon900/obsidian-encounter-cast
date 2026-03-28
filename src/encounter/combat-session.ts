import type { MonsterRecord } from "../monsters/types";
import type { ResolvedEncounterEntry } from "./codeblock-resolver";

export interface Combatant {
	id: string;
	name: string;
	monsterName: string;
	isPlayer?: boolean;
	challenge: string | null;
	hpCurrent: number | null;
	hpMax: number | null;
	tempHp: number;
	ac: number | null;
	dexMod: number | null;
	initiative: number | null;
	initiativeRoll: number | null;
	initiativeCriticalFailure: boolean;
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

interface AddCombatantsOptions {
	rollInitiative?: boolean;
	insertByInitiative?: boolean;
	resolveHpForMonster?: (monster: MonsterRecord) => number | null;
}

export function createCombatSession(
	title: string | null,
	entries: ResolvedEncounterEntry[],
	options: AddCombatantsOptions = {},
): CombatSession {
	const createdAt = new Date().toISOString();
	const rollInitiative = options.rollInitiative ?? false;
	const combatants = expandCombatants(entries, [], {
		rollInitiative,
		resolveHpForMonster: options.resolveHpForMonster,
	});
	const ordered = rollInitiative ? sortCombatantsByInitiative(combatants) : combatants;
	return {
		id: `session-${Date.now().toString(36)}`,
		title,
		round: 1,
		activeIndex: 0,
		combatants: ordered,
		createdAt,
		updatedAt: createdAt,
	};
}

export function addCombatantsToSession(
	session: CombatSession,
	title: string | null,
	entries: ResolvedEncounterEntry[],
	options: AddCombatantsOptions = {},
): CombatSession {
	const rollInitiative = options.rollInitiative ?? false;
	const insertByInitiative = options.insertByInitiative ?? false;
	const additions = expandCombatants(entries, session.combatants, {
		rollInitiative,
		resolveHpForMonster: options.resolveHpForMonster,
	});
	if (additions.length === 0) {
		return session;
	}

	const combatants = insertByInitiative
		? sortCombatantsByInitiative(session.combatants.concat(additions))
		: session.combatants.concat(additions);
	const activeId = session.combatants[session.activeIndex]?.id ?? null;
	const activeIndex = activeId ? Math.max(0, combatants.findIndex((combatant) => combatant.id === activeId)) : 0;
	return stamp({
		...session,
		title: session.title ?? title,
		activeIndex,
		combatants,
	});
}

export function rollMonsterInitiative(session: CombatSession): CombatSession {
	if (session.combatants.length === 0) {
		return session;
	}

	const activeId = session.combatants[session.activeIndex]?.id ?? null;
	const rerolled = session.combatants.map((combatant) => {
		if (combatant.isPlayer) {
			return combatant;
		}

		const roll = rollInitiativeForMonster(combatant.dexMod);
		return {
			...combatant,
			initiative: roll.total,
			initiativeRoll: roll.roll,
			initiativeCriticalFailure: roll.isCriticalFailure,
		};
	});

	const combatants = sortCombatantsByInitiative(rerolled);
	const activeIndex = activeId ? Math.max(0, combatants.findIndex((combatant) => combatant.id === activeId)) : 0;
	return stamp({
		...session,
		activeIndex,
		combatants,
	});
}

export function setActiveToTopCombatant(session: CombatSession): CombatSession {
	if (session.combatants.length === 0 || session.activeIndex === 0) {
		return session;
	}

	return stamp({
		...session,
		activeIndex: 0,
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

export function setCombatantHpMax(session: CombatSession, combatantId: string, hpMax: number | null): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => {
		const nextHpMax = hpMax === null ? null : Math.max(0, hpMax);
		const nextHpCurrent =
			combatant.hpCurrent === null || nextHpMax === null ? combatant.hpCurrent : Math.min(combatant.hpCurrent, nextHpMax);
		return {
			...combatant,
			hpMax: nextHpMax,
			hpCurrent: nextHpCurrent,
		};
	});
}

export function setCombatantTempHp(session: CombatSession, combatantId: string, tempHp: number): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => ({
		...combatant,
		tempHp: Math.max(0, tempHp),
	}));
}

export function setCombatantAc(session: CombatSession, combatantId: string, ac: number | null): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => ({
		...combatant,
		ac: ac === null ? null : Math.max(0, ac),
	}));
}

export function setCombatantDexMod(session: CombatSession, combatantId: string, dexMod: number | null): CombatSession {
	return updateCombatant(session, combatantId, (combatant) => ({
		...combatant,
		dexMod,
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

export function rollCombatantInitiative(session: CombatSession, combatantId: string): CombatSession {
	const sourceIndex = session.combatants.findIndex((combatant) => combatant.id === combatantId);
	if (sourceIndex === -1) {
		return session;
	}

	const target = session.combatants[sourceIndex];
	if (!target) {
		return session;
	}

	const roll = rollInitiativeForMonster(target.dexMod);
	const combatants = session.combatants.slice();
	combatants[sourceIndex] = {
		...target,
		initiative: roll.total,
		initiativeRoll: roll.roll,
		initiativeCriticalFailure: roll.isCriticalFailure,
	};
	const sorted = sortCombatantsByInitiative(combatants);
	const activeId = session.combatants[session.activeIndex]?.id ?? null;
	const activeIndex = activeId ? Math.max(0, sorted.findIndex((combatant) => combatant.id === activeId)) : 0;
	return stamp({
		...session,
		activeIndex,
		combatants: sorted,
	});
}

export function setCombatantInitiative(
	session: CombatSession,
	combatantId: string,
	initiativeTotal: number | null,
	rollType: "nat1" | "normal" | "nat20" = "normal",
): CombatSession {
	const sourceIndex = session.combatants.findIndex((combatant) => combatant.id === combatantId);
	if (sourceIndex === -1) {
		return session;
	}

	const target = session.combatants[sourceIndex];
	if (!target) {
		return session;
	}

	const combatants = session.combatants.slice();
	combatants[sourceIndex] = {
		...target,
		initiative: initiativeTotal === null ? null : Math.max(1, Math.trunc(initiativeTotal)),
		initiativeRoll: rollType === "nat1" ? 1 : rollType === "nat20" ? 20 : null,
		initiativeCriticalFailure: rollType === "nat1",
	};
	const sorted = sortCombatantsByInitiative(combatants);
	const activeId = session.combatants[session.activeIndex]?.id ?? null;
	const activeIndex = activeId ? Math.max(0, sorted.findIndex((combatant) => combatant.id === activeId)) : 0;
	return stamp({
		...session,
		activeIndex,
		combatants: sorted,
	});
}

export function upsertPlayerCombatant(session: CombatSession, playerId: string, playerName: string): CombatSession {
	const existing = session.combatants.find((combatant) => combatant.monster.id === `player::${playerId}`);
	if (existing) {
		if (existing.name === playerName && existing.monsterName === playerName) {
			return session;
		}
		return updateCombatant(session, existing.id, (combatant) => ({
			...combatant,
			name: playerName,
			monsterName: playerName,
			monster: {
				...combatant.monster,
				name: playerName,
				slug: playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
			},
		}));
	}

	const slug = playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "player";
	const playerMonster: MonsterRecord = {
		id: `player::${playerId}`,
		name: playerName,
		challenge: null,
		xp: null,
		hp: null,
		max_hp: null,
		hp_formula: null,
		ac: null,
		dex_mod: 0,
		damage_vulnerabilities: [],
		damage_resistances: [],
		damage_immunities: [],
		condition_immunities: [],
		source: null,
		slug,
	};

	const combatant: Combatant = {
		id: `combatant-player-${playerId}`,
		name: playerName,
		monsterName: playerName,
		isPlayer: true,
		challenge: null,
		hpCurrent: null,
		hpMax: null,
		tempHp: 0,
		ac: null,
		dexMod: 0,
		initiative: null,
		initiativeRoll: null,
		initiativeCriticalFailure: false,
		monster: playerMonster,
	};

	return stamp({
		...session,
		combatants: session.combatants.concat(combatant),
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

function expandCombatants(
	entries: ResolvedEncounterEntry[],
	existingCombatants: Combatant[] = [],
	options: AddCombatantsOptions = {},
): Combatant[] {
	const counters = buildNameCounters(existingCombatants);
	const combatants: Combatant[] = [];
	const rollInitiative = options.rollInitiative ?? false;
	const resolveHpForMonster = options.resolveHpForMonster;

	for (const item of entries) {
		for (let copyIndex = 0; copyIndex < item.entry.quantity; copyIndex++) {
			const monsterName = item.monster.name;
			const baseName = item.entry.customName ?? monsterName;
			const displayName = nextCombatantLabel(baseName, counters);
			const idSeed = `${item.monster.id}-${item.entry.line}-${existingCombatants.length + combatants.length + 1}`;
			const initiativeRoll = rollInitiative ? rollInitiativeForMonster(item.monster.dex_mod) : null;
			const rolledHp = resolveHpForMonster ? resolveHpForMonster(item.monster) : null;
			const hpMax = rolledHp ?? item.monster.max_hp ?? item.monster.hp;
			combatants.push({
				id: `combatant-${idSeed}`,
				name: displayName,
				monsterName,
				isPlayer: false,
				challenge: item.monster.challenge,
				hpCurrent: hpMax,
				hpMax,
				tempHp: 0,
				ac: item.monster.ac,
				dexMod: item.monster.dex_mod,
				initiative: initiativeRoll?.total ?? null,
				initiativeRoll: initiativeRoll?.roll ?? null,
				initiativeCriticalFailure: initiativeRoll?.isCriticalFailure ?? false,
				monster: item.monster,
			});
		}
	}

	return combatants;
}

function buildNameCounters(existingCombatants: Combatant[]): Map<string, number> {
	const counters = new Map<string, number>();
	for (const combatant of existingCombatants) {
		if (combatant.isPlayer) {
			continue;
		}

		const parsed = parseNameSuffix(combatant.name);
		const key = parsed.base;
		const nextCount = parsed.suffixIndex ?? 1;
		const current = counters.get(key) ?? 0;
		counters.set(key, Math.max(current, nextCount));
	}
	return counters;
}

function nextCombatantLabel(baseName: string, counters: Map<string, number>): string {
	const next = (counters.get(baseName) ?? 0) + 1;
	counters.set(baseName, next);
	return `${baseName} ${indexToAlphaSuffix(next)}`;
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

function parseNameSuffix(name: string): { base: string; suffixIndex: number | null } {
	const trimmed = name.trim();
	const match = /^(.*)\s+([A-Z]+)$/.exec(trimmed);
	if (!match?.[1] || !match[2]) {
		return { base: trimmed, suffixIndex: null };
	}

	const base = match[1].trim();
	if (!base.length) {
		return { base: trimmed, suffixIndex: null };
	}

	return { base, suffixIndex: alphaSuffixToIndex(match[2]) };
}

function alphaSuffixToIndex(suffix: string): number {
	let value = 0;
	for (let i = 0; i < suffix.length; i++) {
		const code = suffix.charCodeAt(i);
		value = value * 26 + (code - 64);
	}
	return value;
}

function stamp(session: CombatSession): CombatSession {
	return {
		...session,
		updatedAt: new Date().toISOString(),
	};
}

function rollInitiativeForMonster(dexMod: number | null): { roll: number; total: number; isCriticalFailure: boolean } {
	const modifier = dexMod ?? 0;
	const d20 = Math.floor(Math.random() * 20) + 1;
	const total = d20 === 20 ? Math.max(20, d20 + modifier) : Math.max(1, d20 + modifier);
	return {
		roll: d20,
		total,
		isCriticalFailure: d20 === 1,
	};
}

function sortCombatantsByInitiative(combatants: Combatant[]): Combatant[] {
	return combatants
		.map((combatant, index) => ({ combatant, index }))
		.sort((left, right) => {
			const leftInit = left.combatant.initiative ?? Number.NEGATIVE_INFINITY;
			const rightInit = right.combatant.initiative ?? Number.NEGATIVE_INFINITY;
			if (rightInit !== leftInit) {
				return rightInit - leftInit;
			}

			return left.index - right.index;
		})
		.map((item) => item.combatant);
}
