import { useEffect, useRef, useState } from "preact/hooks";
import {
	computeEncounterDifficulty,
	computeEncounterTotalXp,
	type EncounterPartySettings
} from "../../encounter/encounter-difficulty";
import type { MonsterRecord } from "../../monsters/types";
import { MonsterHoverPreviewTrigger } from "../monsters/monster-hover-preview-trigger";

export interface EncounterPreviewRow {
	id: string;
	quantity: number;
	customName: string | null;
	monsterQuery: string;
	monsterName: string;
	resolved: boolean;
	challenge: string | null;
	xp: number | null;
	monster: MonsterRecord | null;
}

interface EncounterBlockWidgetProps {
	title: string | null;
	rows: EncounterPreviewRow[];
	partySettings: EncounterPartySettings;
	onInfo: (monster: MonsterRecord) => void;
	onHoverInfo: (monster: MonsterRecord, anchorEl: HTMLElement) => void;
	onHoverLeave: () => void;
	onRowsChange: (rows: EncounterPreviewRow[], title: string | null) => void;
	onTitleChange: (rows: EncounterPreviewRow[], title: string | null) => void;
	onRunEncounter: (rows: EncounterPreviewRow[], title: string | null) => void;
	onAddToEncounter: (rows: EncounterPreviewRow[], title: string | null) => void;
	onOpenPartySettings: () => void;
}

// Renders the interactive preview for an `encounter` codeblock.
// This component is the UI source of truth while rendered:
// - local state tracks transient edits (title, row quantities, hover timers)
// - callbacks persist those edits back into the underlying markdown source
export function EncounterBlockWidget(props: EncounterBlockWidgetProps) {
	// Local UI state is seeded from parsed codeblock data and kept in sync via effects.
	const [rows, setRows] = useState<EncounterPreviewRow[]>(props.rows);
	const [title, setTitle] = useState<string | null>(props.title);
	const [titleDraft, setTitleDraft] = useState(props.title ?? "");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement | null>(null);

	// Display helpers normalize how names and CR/XP are shown across row variants.
	const getDisplayName = (row: EncounterPreviewRow) => row.customName ?? row.monsterName;
	const getCrLabel = (row: EncounterPreviewRow) => {
		const cr = row.challenge ?? "-";
		if (row.xp === null) {
			return `CR ${cr}`;
		}
		return `CR ${cr} (${row.xp}xp)`;
	};

	// Keep widget state aligned with external rerenders (e.g. source updates).
	useEffect(() => {
		setRows(props.rows);
	}, [props.rows]);
	useEffect(() => {
		setTitle(props.title);
		if (!isEditingTitle) {
			setTitleDraft(props.title ?? "");
		}
	}, [props.title, isEditingTitle]);

	// When title editing starts, immediately focus and place the caret at the end.
	// The zero-timeout second pass handles cases where the input mounts a tick later.
	useEffect(() => {
		if (!isEditingTitle || !titleInputRef.current) {
			return;
		}

		const input = titleInputRef.current;
		const placeCaretAtEnd = () => {
			const end = input.value.length;
			input.focus();
			input.setSelectionRange(end, end);
		};

		placeCaretAtEnd();
		const timerId = window.setTimeout(placeCaretAtEnd, 0);
		return () => window.clearTimeout(timerId);
	}, [isEditingTitle]);

	// Quantity updates are applied optimistically in the rendered preview and
	// propagated to the parent so the markdown codeblock is rewritten accordingly.
	const updateRowCount = (id: string, delta: number) => {
		setRows((currentRows) => {
			const updated = currentRows
				.map((row) => (row.id === id ? { ...row, quantity: row.quantity + delta } : row))
				.filter((row) => row.quantity > 0);
			props.onRowsChange(updated, title);
			return updated;
		});
	};
	const totalXp = computeEncounterTotalXp(rows);
	const difficulty = computeEncounterDifficulty(totalXp, props.partySettings);
	const difficultyLabel = difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : null;

	// Title edits are inline and persisted on commit; empty titles become `null`
	// so serialization can fall back to "Untitled encounter" behavior.
	const startTitleEdit = () => {
		setIsEditingTitle(true);
		setTitleDraft(title ?? "");
	};
	const commitTitleEdit = () => {
		const normalized = titleDraft.trim();
		const nextTitle = normalized.length ? normalized : null;
		setIsEditingTitle(false);
		setTitle(nextTitle);
		props.onTitleChange(rows, nextTitle);
	};
	const cancelTitleEdit = () => {
		setIsEditingTitle(false);
		setTitleDraft(title ?? "");
	};

	return (
		<div className="encounter-cast-encounter-widget">
			{/* Click-to-edit title keeps the same visual style when not editing. */}
			<div className="encounter-cast-encounter-title">
				{isEditingTitle ? (
					<input
						ref={titleInputRef}
						type="text"
						value={titleDraft}
						placeholder="Encounter title"
						onInput={(event) => setTitleDraft((event.target as HTMLInputElement).value)}
						onBlur={commitTitleEdit}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								(event.target as HTMLInputElement).blur();
								return;
							}
							if (event.key === "Escape") {
								event.preventDefault();
								cancelTitleEdit();
							}
						}}
						autoFocus
					/>
				) : (
					<span
						className="encounter-cast-encounter-title-trigger"
						onClick={startTitleEdit}
						title="Edit encounter title"
						role="button"
						tabIndex={0}
						aria-label="Edit encounter title"
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								startTitleEdit();
							}
						}}
					>
						{title ?? "Untitled encounter"}
					</span>
				)}
			</div>

			{/* Encounter rows support live count adjustments and monster hover/info actions. */}
			<div className="encounter-cast-encounter-rows">
				{rows.map((row) => (
					<div key={row.id} className="encounter-cast-encounter-row">
						<div className="encounter-cast-encounter-row-left">
							<div className="encounter-cast-encounter-row-stepper">
								<button
									type="button"
									aria-label={`Increase ${getDisplayName(row)}`}
									onClick={() => updateRowCount(row.id, 1)}
								>
									▴
								</button>
								<button
									type="button"
									aria-label={`Decrease ${getDisplayName(row)}`}
									onClick={() => updateRowCount(row.id, -1)}
								>
									▾
								</button>
							</div>
							<span className="encounter-cast-encounter-row-count">{row.quantity}x</span>
							<MonsterHoverPreviewTrigger
								monster={row.monster}
								className="encounter-cast-encounter-row-name"
								onHoverInfo={props.onHoverInfo}
								onHoverLeave={props.onHoverLeave}
							>
								{row.customName ? (
									<>
										<span className={row.resolved ? "" : "encounter-cast-encounter-row-unresolved-name"}>
											{row.customName}
										</span>
										<span className="encounter-cast-encounter-row-monster-name">{row.monsterName}</span>
									</>
								) : (
									<span className={row.resolved ? "" : "encounter-cast-encounter-row-unresolved-name"}>
										{row.monsterName}
									</span>
								)}
							</MonsterHoverPreviewTrigger>
						</div>
						<div className="encounter-cast-encounter-row-right">
							{row.resolved ? <span className="encounter-cast-encounter-row-cr">{getCrLabel(row)}</span> : null}
							{row.monster ? (
								<button
									type="button"
									aria-label={`Open ${getDisplayName(row)}`}
									onClick={() => {
										if (row.monster) {
											props.onInfo(row.monster);
										}
									}}
								>
									i
								</button>
							) : null}
						</div>
					</div>
				))}
			</div>

			{/* Primary actions (run/add) plus derived XP and optional difficulty summary. */}
			<div className="encounter-cast-encounter-actions">
				<div className="encounter-cast-encounter-actions-left">
					<button
						type="button"
						aria-label="Run encounter"
						title="Run encounter"
						onClick={() => props.onRunEncounter(rows, title)}
					>
						▶
					</button>
					<button
						type="button"
						aria-label="Add to encounter"
						title="Add to encounter"
						onClick={() => props.onAddToEncounter(rows, title)}
					>
						✚
					</button>
				</div>
				<div className="encounter-cast-encounter-actions-right">
					{difficulty ? (
						<span className={`encounter-cast-encounter-difficulty is-${difficulty}`}>
							{difficultyLabel} ({totalXp}xp)
						</span>
					) : (
						<span className="encounter-cast-encounter-xp">{totalXp}xp</span>
					)}
					<div className="encounter-cast-encounter-settings">
						<button
							type="button"
							className="encounter-cast-encounter-settings-trigger"
							aria-label="Encounter settings"
							onClick={props.onOpenPartySettings}
						>
							⚙
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
