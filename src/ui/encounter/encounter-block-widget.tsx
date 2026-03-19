import { useEffect, useState } from "preact/hooks";
import type { MonsterRecord } from "../../monsters/types";

export interface EncounterPreviewRow {
	id: string;
	quantity: number;
	customName: string | null;
	monsterQuery: string;
	monsterName: string;
	resolved: boolean;
	challenge: string | null;
	monster: MonsterRecord | null;
}

interface EncounterBlockWidgetProps {
	title: string | null;
	rows: EncounterPreviewRow[];
	onInfo: (monster: MonsterRecord) => void;
	onRowsChange: (rows: EncounterPreviewRow[]) => void;
	onRunEncounter: (rows: EncounterPreviewRow[]) => void;
	onAddToEncounter: (rows: EncounterPreviewRow[]) => void;
}

export function EncounterBlockWidget(props: EncounterBlockWidgetProps) {
	const [rows, setRows] = useState<EncounterPreviewRow[]>(props.rows);
	const getDisplayName = (row: EncounterPreviewRow) => row.customName ?? row.monsterName;

	useEffect(() => {
		setRows(props.rows);
	}, [props.rows]);

	const updateRowCount = (id: string, delta: number) => {
		setRows((currentRows) => {
			const updated = currentRows
				.map((row) => (row.id === id ? { ...row, quantity: row.quantity + delta } : row))
				.filter((row) => row.quantity > 0);
			props.onRowsChange(updated);
			return updated;
		});
	};

	return (
		<div className="encounter-cast-encounter-widget">
			{props.title ? <div className="encounter-cast-encounter-title">{props.title}</div> : null}
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
									+
								</button>
								<button
									type="button"
									aria-label={`Decrease ${getDisplayName(row)}`}
									onClick={() => updateRowCount(row.id, -1)}
								>
									-
								</button>
							</div>
							<span className="encounter-cast-encounter-row-count">{row.quantity}x</span>
							<span className="encounter-cast-encounter-row-name">
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
							{row.resolved ? <span className="encounter-cast-encounter-row-cr">CR {row.challenge ?? "-"}</span> : null}
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
				<button type="button" onClick={() => props.onRunEncounter(rows)}>
					Run encounter
				</button>
				<button type="button" onClick={() => props.onAddToEncounter(rows)}>
					Add to encounter
				</button>
			</div>
		</div>
	);
}
