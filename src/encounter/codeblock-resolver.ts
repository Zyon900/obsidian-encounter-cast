import type { MonsterManager } from "../monsters/monster-manager";
import type { MonsterRecord } from "../monsters/types";
import type { EncounterEntry } from "./codeblock-parser";

export interface ResolvedEncounterEntry {
	entry: EncounterEntry;
	monster: MonsterRecord;
}

export interface ResolveEncounterResult {
	resolved: ResolvedEncounterEntry[];
	unresolved: EncounterEntry[];
}

export function resolveEncounterEntries(entries: EncounterEntry[], monsterManager: MonsterManager): ResolveEncounterResult {
	const resolved: ResolvedEncounterEntry[] = [];
	const unresolved: EncounterEntry[] = [];

	for (const entry of entries) {
		const query = entry.monsterQuery.trim().toLowerCase();
		const exact = monsterManager
			.searchMonsters(entry.monsterQuery)
			.find((hit) => hit.monster.name.trim().toLowerCase() === query);
		if (!exact) {
			unresolved.push(entry);
			continue;
		}

		resolved.push({
			entry,
			monster: exact.monster,
		});
	}

	return { resolved, unresolved };
}
