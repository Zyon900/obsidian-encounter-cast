import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type KeyBinding, type EditorView } from "@codemirror/view";

function isInsideEncounterCodeBlock(view: EditorView, lineNumber: number): boolean {
	let inEncounterFence = false;
	for (let current = 1; current <= lineNumber; current++) {
		const line = view.state.doc.line(current);
		const text = line.text.trim();
		if (!text.startsWith("```")) {
			continue;
		}

		const language = text.slice(3).trim().toLowerCase();
		if (!inEncounterFence && language === "encounter") {
			inEncounterFence = true;
			continue;
		}

		if (inEncounterFence) {
			inEncounterFence = false;
		}
	}

	return inEncounterFence;
}

function runEncounterEnterBehavior(view: EditorView): boolean {
	const selection = view.state.selection.main;
	if (!selection.empty) {
		return false;
	}

	const line = view.state.doc.lineAt(selection.from);
	if (!isInsideEncounterCodeBlock(view, line.number)) {
		return false;
	}

	const firstQuote = line.text.indexOf("'");
	const secondQuote = line.text.lastIndexOf("'");
	if (firstQuote < 0 || secondQuote <= firstQuote) {
		return false;
	}

	const cursorInLine = selection.from - line.from;
	if (cursorInLine <= firstQuote || cursorInLine > secondQuote) {
		return false;
	}

	const insideQuotes = line.text.slice(firstQuote + 1, secondQuote);
	const hasEmptyQuotes = insideQuotes.trim().length === 0;

	if (hasEmptyQuotes) {
		const cleanedLine = line.text.replace(/\s+''\s*$/, "");
		const insert = `${cleanedLine}\n`;
		const cursor = line.from + cleanedLine.length + 1;
		view.dispatch({
			changes: { from: line.from, to: line.to, insert },
			selection: EditorSelection.cursor(cursor),
			scrollIntoView: true,
		});
		return true;
	}

	const cursor = line.to + 1;
	view.dispatch({
		changes: { from: line.to, to: line.to, insert: "\n" },
		selection: EditorSelection.cursor(cursor),
		scrollIntoView: true,
	});
	return true;
}

export function createEncounterEditorKeymap() {
	const bindings: KeyBinding[] = [
		{
			key: "Enter",
			preventDefault: true,
			run: runEncounterEnterBehavior,
		},
	];

	return Prec.highest(keymap.of(bindings));
}
