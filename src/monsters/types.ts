export interface MonsterRecord {
	id: string;
	name: string;
	challenge: string | null;
	xp: number | null;
	hp: number | null;
	ac: number | null;
	dex: number | null;
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
