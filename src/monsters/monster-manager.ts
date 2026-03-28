import { prepareFuzzySearch, type App } from "obsidian";
import { FantasyStatblocksAdapter } from "./fantasy-statblocks-adapter";
import type { MonsterManagerState, MonsterRecord, MonsterSearchHit } from "./types";

const SEARCH_RESULT_LIMIT = 7;
const XP_BY_CHALLENGE: Record<string, number> = {
	"0": 10,
	"1/8": 25,
	"1/4": 50,
	"1/2": 100,
	"1": 200,
	"2": 450,
	"3": 700,
	"4": 1100,
	"5": 1800,
	"6": 2300,
	"7": 2900,
	"8": 3900,
	"9": 5000,
	"10": 5900,
	"11": 7200,
	"12": 8400,
	"13": 10000,
	"14": 11500,
	"15": 13000,
	"16": 15000,
	"17": 18000,
	"18": 20000,
	"19": 22000,
	"20": 25000,
	"21": 33000,
	"22": 41000,
	"23": 50000,
	"24": 62000,
	"25": 75000,
	"26": 90000,
	"27": 105000,
	"28": 120000,
	"29": 135000,
	"30": 155000,
};

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

	constructor(app: App) {
		this.adapter = new FantasyStatblocksAdapter(app);
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

	getAllMonsters(): MonsterRecord[] {
		this.loadCacheIfNeeded();
		return [...this.cachedMonsters].sort((left, right) => left.name.localeCompare(right.name));
	}

	async openCreaturePreview(monster: MonsterRecord): Promise<void> {
		await this.adapter.openCreaturePreview(monster);
	}

	async openCreatureHoverPreview(monster: MonsterRecord): Promise<void> {
		await this.adapter.openCreatureHoverPreview(monster);
	}

	async showCreatureHoverPreview(monster: MonsterRecord, anchorEl: HTMLElement): Promise<void> {
		await this.adapter.showCreatureHoverPreview(monster, anchorEl);
	}

	hideCreatureHoverPreview(): void {
		this.adapter.hideCreatureHoverPreview();
	}

	scheduleHideCreatureHoverPreview(delayMs = 500): void {
		this.adapter.scheduleHideCreatureHoverPreview(delayMs);
	}

	setHoverPreviewLayout(widthPx: number, wideColumns: boolean): void {
		this.adapter.setHoverPreviewLayout(widthPx, wideColumns);
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
			xp: this.readXp(record),
			hp: this.readHpValue(record.hp),
			max_hp: this.readNumber(record.max_hp) ?? this.readNumber(record.hpMax) ?? this.readHpValue(record.hp),
			hp_formula: this.readHpFormula(record),
			ac: this.readNumber(record.ac),
			dex_mod: this.readDexMod(record),
			damage_vulnerabilities: this.readStringList(record.damage_vulnerabilities),
			damage_resistances: this.readStringList(record.damage_resistances),
			damage_immunities: this.readStringList(record.damage_immunities),
			condition_immunities: this.readStringList(record.condition_immunities),
			source: source ?? null,
			slug,
			raw: rawMonster,
		};
	}

	private readDexMod(record: Record<string, unknown>): number | null {
		const directMod = this.readNumber(record.dex_mod) ?? this.readNumber(record.dexMod);
		if (directMod !== null) {
			return directMod;
		}

		const directDex = this.readNumber(record.dex);
		if (directDex !== null) {
			return this.dexScoreToMod(directDex);
		}

		if (!Array.isArray(record.stats) || record.stats.length < 2) {
			return null;
		}

		const statDex = this.readNumber(record.stats[1]);
		return statDex === null ? null : this.dexScoreToMod(statDex);
	}

	private dexScoreToMod(score: number): number {
		return Math.floor((score - 10) / 2);
	}

	private readHpValue(value: unknown): number | null {
		const direct = this.readNumber(value);
		if (direct !== null) {
			return direct;
		}

		if (value && typeof value === "object") {
			const record = value as Record<string, unknown>;
			return this.readNumber(record.average) ?? this.readNumber(record.value) ?? this.readNumber(record.max);
		}

		return null;
	}

	private readHpFormula(record: Record<string, unknown>): string | null {
		const direct =
			this.readDiceFormula(record.hp_formula) ??
			this.readDiceFormula(record.hpFormula) ??
			this.readDiceFormula(record.hit_points_roll) ??
			this.readDiceFormula(record.hitPointsRoll) ??
			this.readDiceFormula(record.hp_roll) ??
			this.readDiceFormula(record.hpRoll) ??
			this.readDiceFormula(record.hit_dice) ??
			this.readDiceFormula(record.hitDice) ??
			this.readDiceFormula(record.hit_points) ??
			this.readDiceFormula(record.hitPoints);
		if (direct) {
			return direct;
		}

		return this.readDiceFormula(record.hp);
	}

	private readDiceFormula(value: unknown): string | null {
		if (typeof value === "string") {
			return this.extractDiceExpression(value);
		}
		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		for (const key of ["formula", "dice", "hit_dice", "hitDice", "expression", "value"]) {
			const candidate = this.readDiceFormula(record[key]);
			if (candidate) {
				return candidate;
			}
		}

		return null;
	}

	private extractDiceExpression(text: string): string | null {
		const normalized = text.replace(/\s+/g, " ").trim();
		if (!normalized.length) {
			return null;
		}
		const match = /\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/i.exec(normalized);
		if (!match?.[0]) {
			return null;
		}
		return match[0].replace(/\s+/g, "");
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

	private readStringList(value: unknown): string[] {
		if (value === null || value === undefined) {
			return [];
		}

		if (typeof value === "string") {
			return value
				.split(/[,;]+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);
		}

		if (Array.isArray(value)) {
			const collected: string[] = [];
			for (const item of value) {
				const nested = this.readStringList(item);
				for (const entry of nested) {
					if (!collected.includes(entry)) {
						collected.push(entry);
					}
				}
			}
			return collected;
		}

		if (typeof value === "object") {
			const record = value as Record<string, unknown>;
			const common =
				this.readString(record.name) ??
				this.readString(record.entry) ??
				this.readString(record.text) ??
				this.readString(record.value);
			if (common) {
				return [common];
			}
		}

		return [];
	}

	private readChallenge(value: unknown): string | null {
		if (value && typeof value === "object") {
			const record = value as Record<string, unknown>;
			const nestedChallenge = this.readChallenge(record.cr);
			if (nestedChallenge) {
				return nestedChallenge;
			}
		}

		if (typeof value === "number" && Number.isFinite(value)) {
			return String(value);
		}
		if (typeof value === "string" && value.trim().length) {
			const trimmed = value.trim();
			return this.extractCrFromText(trimmed) ?? trimmed;
		}
		return null;
	}

	private readXp(record: Record<string, unknown>): number | null {
		const direct = this.readNumber(record.xp);
		if (direct !== null) {
			return direct;
		}

		const directExp = this.readNumber(record.exp) ?? this.readNumber(record.experience);
		if (directExp !== null) {
			return directExp;
		}

		const challenge = record.cr;
		if (challenge && typeof challenge === "object") {
			const nested = challenge as Record<string, unknown>;
			const nestedXp =
				this.readNumber(nested.xp) ?? this.readNumber(nested.exp) ?? this.readNumber(nested.experience);
			if (nestedXp !== null) {
				return nestedXp;
			}
		}

		const crText = this.readString(record.cr);
		if (crText) {
			const xpFromCrText = this.readXpFromCrText(crText);
			if (xpFromCrText !== null) {
				return xpFromCrText;
			}
		}

		const challengeText = this.readChallenge(record.cr);
		if (!challengeText) {
			return null;
		}

		return XP_BY_CHALLENGE[challengeText] ?? null;
	}

	private readXpFromCrText(crText: string): number | null {
		const match = crText.match(/(\d[\d,.]*)\s*xp/i);
		if (!match?.[1]) {
			return null;
		}

		const normalized = match[1].replace(/[,.]/g, "");
		const parsed = Number.parseInt(normalized, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}

	private extractCrFromText(value: string): string | null {
		const prefixed = value.match(/cr\s*([0-9]+(?:\/[0-9]+)?)/i);
		if (prefixed?.[1]) {
			return prefixed[1];
		}

		const plain = value.match(/^([0-9]+(?:\/[0-9]+)?)(?:\s|\(|$)/);
		if (plain?.[1]) {
			return plain[1];
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
