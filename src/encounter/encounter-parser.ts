export interface EncounterEntry {
	line: number;
	quantity: number;
	monsterQuery: string;
	customName: string | null;
}

export interface EncounterParseError {
	line: number;
	message: string;
	raw: string;
}

export interface EncounterParseResult {
	title: string | null;
	entries: EncounterEntry[];
	errors: EncounterParseError[];
}

const ENCOUNTER_LINE_REGEX = /^\s*(\d+)\s*x\s+(.+?)(?:\s+'([^']+)')?\s*$/;

export function parseEncounterBlock(source: string): EncounterParseResult {
	const lines = source.split(/\r?\n/);
	let title: string | null = null;
	const entries: EncounterEntry[] = [];
	const errors: EncounterParseError[] = [];
	let firstNonEmptyHandled = false;

	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index] ?? "";
		const trimmed = raw.trim();
		if (!trimmed.length) {
			continue;
		}

		const match = ENCOUNTER_LINE_REGEX.exec(raw);
		if (!firstNonEmptyHandled) {
			firstNonEmptyHandled = true;
			if (!match) {
				title = trimmed;
				continue;
			}
		}

		if (!match) {
			errors.push({
				line: index + 1,
				message: "Expected '<qty>x <monster name> 'optional custom name''.",
				raw,
			});
			continue;
		}

		const quantityValue = match[1] ?? "";
		const quantity = Number.parseInt(quantityValue, 10);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			errors.push({
				line: index + 1,
				message: "Quantity must be a positive number.",
				raw,
			});
			continue;
		}

		const monsterQueryValue = match[2] ?? "";
		const monsterQuery = monsterQueryValue.trim();
		if (!monsterQuery.length) {
			errors.push({
				line: index + 1,
				message: "Monster name is required.",
				raw,
			});
			continue;
		}

		entries.push({
			line: index + 1,
			quantity,
			monsterQuery,
			customName: (match[3] ?? "").trim() || null,
		});
	}

	return { title, entries, errors };
}

export function summarizeEncounterSource(source: string): { title: string | null; entryCount: number } {
	const parsed = parseEncounterBlock(source);
	return {
		title: parsed.title,
		entryCount: parsed.entries.length,
	};
}
