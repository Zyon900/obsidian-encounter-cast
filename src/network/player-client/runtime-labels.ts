export function parseIntOrNull(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed.length) {
		return null;
	}
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function hpClass(label: string): string {
	return `hp-label is-${label.split(" ").join("-")}`;
}

export function hpStateClass(label: string): string {
	return `sheet-player-health is-${label.split(" ").join("-")}`;
}

export function sentenceCaseLabel(label: string): string {
	if (!label.length) {
		return label;
	}
	return label
		.split(" ")
		.map((part) => (part.length ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
		.join(" ");
}
