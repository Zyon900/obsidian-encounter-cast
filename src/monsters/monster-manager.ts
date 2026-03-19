import { prepareFuzzySearch } from "obsidian";
import { FantasyStatblocksAdapter } from "./fantasy-statblocks-adapter";
import type { MonsterManagerState, MonsterRecord, MonsterSearchHit } from "./types";

const SEARCH_RESULT_LIMIT = 7;

export class MonsterManager {
	private readonly adapter: FantasyStatblocksAdapter;
	private state: MonsterManagerState = {
		ready: false,
		error: null,
		cachedCount: 0,
	};

	private cachedMonsters: MonsterRecord[] = [];
	private cachedNames: string[] = [];
	private cacheLoaded = false;

	constructor(adapter: FantasyStatblocksAdapter) {
		this.adapter = adapter;
	}

	getState(): MonsterManagerState {
		return { ...this.state };
	}

	async initialize(): Promise<void> {
		this.loadCacheIfNeeded();
	}

	invalidateCache(): void {
		this.cachedMonsters = [];
		this.cachedNames = [];
		this.cacheLoaded = false;
		this.state.cachedCount = 0;
		this.state.ready = false;
	}

	refreshCache(): boolean {
		try {
			this.rebuildCache();
			this.cacheLoaded = true;
			this.state.ready = true;
			this.state.error = null;
			return true;
		} catch (error) {
			this.state.ready = false;
			this.state.error = error instanceof Error ? error.message : "Failed to refresh monster cache.";
			return false;
		}
	}

	searchMonsters(query: string): MonsterSearchHit[] {
		this.loadCacheIfNeeded();

		const cleanQuery = query.trim();
		if (!cleanQuery.length) {
			return [];
		}

		const fuzzySearch = prepareFuzzySearch(cleanQuery);
		const hits: MonsterSearchHit[] = [];
		for (let index = 0; index < this.cachedNames.length; index++) {
			const candidateName = this.cachedNames[index];
			const candidateMonster = this.cachedMonsters[index];
			if (!candidateName || !candidateMonster) {
				continue;
			}

			const match = fuzzySearch(candidateName);
			if (!match) {
				continue;
			}

			const score = typeof match.score === "number" ? match.score : 0;
			hits.push({
				monster: candidateMonster,
				score,
			});
		}

		hits.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			return left.monster.name.localeCompare(right.monster.name);
		});

		return hits.slice(0, SEARCH_RESULT_LIMIT);
	}

	async openCreaturePreview(monster: MonsterRecord): Promise<void> {
		await this.adapter.openCreaturePreview(monster);
	}

	private loadCacheIfNeeded(): void {
		if (this.cacheLoaded) {
			return;
		}

		try {
			this.rebuildCache();
			this.cacheLoaded = true;
			this.state.ready = true;
			this.state.error = null;
		} catch (error) {
			this.state.ready = false;
			this.state.error = error instanceof Error ? error.message : "Failed to load monster cache.";
		}
	}

	private rebuildCache(): void {
		const freshCreatures = this.adapter.getCreatures();
		const normalizedMonsters = freshCreatures
			.map((rawMonster) => this.normalizeMonster(rawMonster))
			.filter((monster): monster is MonsterRecord => monster !== null);

		this.cachedMonsters = normalizedMonsters;
		this.cachedNames = normalizedMonsters.map((monster) => monster.name);
		this.state.cachedCount = normalizedMonsters.length;
	}

	private normalizeMonster(rawMonster: unknown): MonsterRecord | null {
		if (!rawMonster || typeof rawMonster !== "object") {
			return null;
		}

		const record = rawMonster as Record<string, unknown>;
		const name = this.readString(record.name);
		if (!name) {
			return null;
		}

		const source = this.readString(record.source) ?? this.readString(record.path);
		const slug = this.slugify(name);
		const id = `${source ?? "unknown"}::${slug}`.toLowerCase();

		return {
			id,
			name,
			challenge: this.readChallenge(record.cr),
			hp: this.readNumber(record.hp),
			ac: this.readNumber(record.ac),
			dex: this.readDex(record),
			source: source ?? null,
			slug,
			raw: rawMonster,
		};
	}

	private readDex(record: Record<string, unknown>): number | null {
		const directDex = this.readNumber(record.dex);
		if (directDex !== null) {
			return directDex;
		}

		if (!Array.isArray(record.stats) || record.stats.length < 2) {
			return null;
		}

		return this.readNumber(record.stats[1]);
	}

	private readString(value: unknown): string | null {
		if (typeof value === "string" && value.trim().length) {
			return value.trim();
		}
		if (Array.isArray(value)) {
			const first = value.find((item) => typeof item === "string" && item.trim().length) as string | undefined;
			return first?.trim() ?? null;
		}
		return null;
	}

	private readNumber(value: unknown): number | null {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = Number.parseInt(value, 10);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	private readChallenge(value: unknown): string | null {
		if (typeof value === "number" && Number.isFinite(value)) {
			return String(value);
		}
		if (typeof value === "string" && value.trim().length) {
			return value.trim();
		}
		return null;
	}

	private slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
	}
}
