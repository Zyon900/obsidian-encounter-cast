import { useEffect, useRef, useState } from "preact/hooks";
import {
	computeEncounterDifficulty,
	computeEncounterTotalXp,
	type EncounterPartySettings
} from "../../encounter/encounter-difficulty";
import type { MonsterRecord } from "../../monsters/types";

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

export function EncounterBlockWidget(props: EncounterBlockWidgetProps) {
	const [rows, setRows] = useState<EncounterPreviewRow[]>(props.rows);
	const [hoverTimeout, setHoverTimeout] = useState<number | null>(null);
	const [title, setTitle] = useState<string | null>(props.title);
	const [titleDraft, setTitleDraft] = useState(props.title ?? "");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const titleInputRef = useRef<HTMLInputElement | null>(null);
	const getDisplayName = (row: EncounterPreviewRow) => row.customName ?? row.monsterName;
	const getCrLabel = (row: EncounterPreviewRow) => {
		const cr = row.challenge ?? "-";
		if (row.xp === null) {
			return `CR ${cr}`;
		}
		return `CR ${cr} (${row.xp}xp)`;
	};

	useEffect(() => {
		setRows(props.rows);
	}, [props.rows]);
	useEffect(() => {
		setTitle(props.title);
		if (!isEditingTitle) {
			setTitleDraft(props.title ?? "");
		}
	}, [props.title, isEditingTitle]);
	useEffect(() => {
		return () => {
			if (hoverTimeout !== null) {
				window.clearTimeout(hoverTimeout);
			}
		};
	}, [hoverTimeout]);
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
	const startHoverPreview = (monster: MonsterRecord | null, anchorEl: HTMLElement) => {
		if (!monster) {
			return;
		}

		if (hoverTimeout !== null) {
			window.clearTimeout(hoverTimeout);
		}

		const timeoutId = window.setTimeout(() => {
			props.onHoverInfo(monster, anchorEl);
		}, 500);
		setHoverTimeout(timeoutId);
	};
	const stopHoverPreview = () => {
		if (hoverTimeout !== null) {
			window.clearTimeout(hoverTimeout);
			setHoverTimeout(null);
		}
		props.onHoverLeave();
	};
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
							<span
								className="encounter-cast-encounter-row-name"
								onMouseEnter={(event) => {
									const target = event.currentTarget as HTMLElement;
									startHoverPreview(row.monster, target);
								}}
								onMouseLeave={stopHoverPreview}
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
							</span>
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
