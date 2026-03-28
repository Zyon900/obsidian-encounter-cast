export interface MonsterRecord {
	id: string;
	name: string;
	challenge: string | null;
	xp: number | null;
	hp: number | null;
	max_hp: number | null;
	hp_formula: string | null;
	ac: number | null;
	dex_mod: number | null;
	damage_vulnerabilities: string[];
	damage_resistances: string[];
	damage_immunities: string[];
	condition_immunities: string[];
	source: string | null;
	slug: string;
	raw?: unknown;
}

export interface MonsterManagerState {
	ready: boolean;
	error: string | null;
	cachedCount: number;
}

export interface MonsterSearchHit {
	monster: MonsterRecord;
	score: number;
}
