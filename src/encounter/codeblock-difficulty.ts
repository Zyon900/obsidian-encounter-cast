export interface EncounterPartySettings {
	partyMembers: number | null;
	partyLevel: number | null;
}

export type EncounterDifficulty = "low" | "medium" | "high";

interface Thresholds {
	low: number;
	medium: number;
	high: number;
}

const XP_THRESHOLDS_BY_LEVEL: Record<number, Thresholds> = {
	1: { low: 25, medium: 50, high: 75 },
	2: { low: 50, medium: 100, high: 150 },
	3: { low: 75, medium: 150, high: 225 },
	4: { low: 125, medium: 250, high: 375 },
	5: { low: 250, medium: 500, high: 750 },
	6: { low: 300, medium: 600, high: 900 },
	7: { low: 350, medium: 750, high: 1100 },
	8: { low: 450, medium: 900, high: 1400 },
	9: { low: 550, medium: 1100, high: 1600 },
	10: { low: 600, medium: 1200, high: 1900 },
	11: { low: 800, medium: 1600, high: 2400 },
	12: { low: 1000, medium: 2000, high: 3000 },
	13: { low: 1100, medium: 2200, high: 3400 },
	14: { low: 1250, medium: 2500, high: 3800 },
	15: { low: 1400, medium: 2800, high: 4300 },
	16: { low: 1600, medium: 3200, high: 4800 },
	17: { low: 2000, medium: 3900, high: 5900 },
	18: { low: 2100, medium: 4200, high: 6300 },
	19: { low: 2400, medium: 4900, high: 7300 },
	20: { low: 2800, medium: 5700, high: 8500 },
};

export function computeEncounterTotalXp(
	rows: Array<{ quantity: number; xp: number | null; resolved: boolean }>,
): number {
	return rows.reduce((total, row) => {
		if (!row.resolved || row.xp === null) {
			return total;
		}
		return total + row.quantity * row.xp;
	}, 0);
}

export function computeEncounterDifficulty(
	totalXp: number,
	settings: EncounterPartySettings,
): EncounterDifficulty | null {
	if (!Number.isFinite(totalXp) || totalXp < 0) {
		return null;
	}

	if (!settings.partyMembers || !settings.partyLevel) {
		return null;
	}

	const partyMembers = Math.floor(settings.partyMembers);
	const partyLevel = Math.floor(settings.partyLevel);
	if (!Number.isFinite(partyMembers) || !Number.isFinite(partyLevel) || partyMembers <= 0) {
		return null;
	}

	const thresholds = XP_THRESHOLDS_BY_LEVEL[partyLevel];
	if (!thresholds) {
		return null;
	}

	const lowBudget = thresholds.low * partyMembers;
	const mediumBudget = thresholds.medium * partyMembers;
	const highBudget = thresholds.high * partyMembers;

	if (totalXp <= lowBudget) {
		return "low";
	}
	if (totalXp <= mediumBudget) {
		return "medium";
	}
	if (totalXp <= highBudget) {
		return "high";
	}

	return "high";
}
