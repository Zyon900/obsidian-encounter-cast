import type { App, MarkdownSectionInformation } from "obsidian";
import type { CodeblockRow } from "../ui/encounter/codeblock-widget";

export function serializeEncounterBody(title: string | null, rows: CodeblockRow[]): string {
	const lines: string[] = [];
	if (title && title.trim().length > 0) {
		lines.push(title.trim());
	}

	for (const row of rows) {
		const sanitizedName = row.customName?.replace(/'/g, "").trim() ?? "";
		const customNamePart = sanitizedName ? ` '${sanitizedName}'` : "";
		lines.push(`${row.quantity}x ${row.monsterQuery}${customNamePart}`);
	}

	return lines.join("\n");
}

export function replaceEncounterSection(
	documentText: string,
	sectionInfo: MarkdownSectionInformation,
	encounterBody: string,
): string {
	const newline = documentText.includes("\r\n") ? "\r\n" : "\n";
	const lines = documentText.split(/\r?\n/);
	const bodyLines = encounterBody.length ? encounterBody.split("\n") : [];
	const fenceLocation = findEncounterFenceRange(lines, sectionInfo);
	if (!fenceLocation) {
		return documentText;
	}

	lines.splice(fenceLocation.opening + 1, fenceLocation.closing - fenceLocation.opening - 1, ...bodyLines);
	return lines.join(newline);
}

export function findEncounterFenceRange(
	lines: string[],
	sectionInfo: MarkdownSectionInformation,
): { opening: number; closing: number } | null {
	const safeStart = Math.max(0, sectionInfo.lineStart);
	const safeEnd = Math.min(lines.length - 1, Math.max(safeStart, sectionInfo.lineEnd));

	for (let index = safeStart; index >= 0; index--) {
		const line = lines[index]?.trim() ?? "";
		if (!line.startsWith("```")) {
			continue;
		}

		if (!/^```encounter(?:\s|$)/i.test(line)) {
			continue;
		}

		for (let closeIndex = Math.max(index + 1, safeEnd); closeIndex < lines.length; closeIndex++) {
			const closingLine = lines[closeIndex]?.trim() ?? "";
			if (closingLine === "```") {
				return { opening: index, closing: closeIndex };
			}
		}

		return null;
	}

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]?.trim() ?? "";
		if (!/^```encounter(?:\s|$)/i.test(line)) {
			continue;
		}

		for (let closeIndex = index + 1; closeIndex < lines.length; closeIndex++) {
			const closingLine = lines[closeIndex]?.trim() ?? "";
			if (closingLine === "```") {
				return { opening: index, closing: closeIndex };
			}
		}
		return null;
	}

	return null;
}

export function tryPersistEncounterRowsInActiveEditor(
	app: App,
	sourcePath: string,
	sectionInfo: MarkdownSectionInformation,
	encounterBody: string,
): boolean {
	const activeFile = app.workspace.getActiveFile();
	const editor = app.workspace.activeEditor?.editor;
	if (!activeFile || activeFile.path !== sourcePath || !editor) {
		return false;
	}

	const documentText = editor.getValue();
	const lines = documentText.split(/\r?\n/);
	const fenceLocation = findEncounterFenceRange(lines, sectionInfo);
	if (!fenceLocation) {
		return false;
	}

	const newline = documentText.includes("\r\n") ? "\r\n" : "\n";
	const replacement = encounterBody.length
		? `${encounterBody.split("\n").join(newline)}${newline}`
		: "";
	editor.replaceRange(
		replacement,
		{ line: fenceLocation.opening + 1, ch: 0 },
		{ line: fenceLocation.closing, ch: 0 },
	);
	return true;
}
