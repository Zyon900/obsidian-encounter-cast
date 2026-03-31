import { parseEncounterBlock, type EncounterParseError, type EncounterParseResult } from "./codeblock-parser";
import { resolveEncounterEntries, type ResolveEncounterResult } from "./codeblock-resolver";
import type { MonsterManager } from "../monsters/monster-manager";
import type { MonsterRecord } from "../monsters/types";

export type PrepareEncounterResult =
	| { ok: false; errors: EncounterParseError[] }
	| { ok: true; parseResult: EncounterParseResult; resolvedResult: ResolveEncounterResult };

export function createUnresolvedMonsterRecord(name: string): MonsterRecord {
	const safeName = name.trim() || "Unknown creature";
	const slug = safeName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

	return {
		id: `unresolved::${slug || "unknown"}`,
		name: safeName,
		challenge: null,
		xp: null,
		hp: null,
		max_hp: null,
		hp_formula: null,
		ac: null,
		dex_mod: null,
		damage_vulnerabilities: [],
		damage_resistances: [],
		damage_immunities: [],
		condition_immunities: [],
		source: null,
		slug: slug || "unknown",
	};
}

export function prepareEncounterSource(source: string, monsterManager: MonsterManager): PrepareEncounterResult {
	const parseResult = parseEncounterBlock(source);
	if (parseResult.errors.length > 0) {
		return { ok: false, errors: parseResult.errors };
	}

	const resolvedResult = resolveEncounterEntries(parseResult.entries, monsterManager);
	if (resolvedResult.unresolved.length > 0) {
		const fallbackEntries = resolvedResult.unresolved.map((entry) => ({
			entry,
			monster: createUnresolvedMonsterRecord(entry.monsterQuery),
		}));
		return {
			ok: true,
			parseResult,
			resolvedResult: {
				resolved: resolvedResult.resolved.concat(fallbackEntries),
				unresolved: [],
			},
		};
	}

	return { ok: true, parseResult, resolvedResult };
}
