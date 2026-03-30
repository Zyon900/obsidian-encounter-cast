import { createHeartIconElement, createHexagonIconElement, createShieldIconElement, createSkullIconElement } from "../../../../utils/icon-factory-tsx";
import type { PlayerFacingState } from "../../../player-contracts";
import { hpStateClass, sentenceCaseLabel } from "../../player-formatters";
import type { SheetMode } from "../../player-types";
import { initiativeClass, isDeathConfirmVisible, isDeathSaveCtaVisible, isPanelOpen, isSheetActionsHidden, isSheetSummaryHidden, isTurnCtaVisible } from "../animation-selectors";
import type { RefObject } from "preact";

type PlayerCombatant = PlayerFacingState["combatants"][number];

interface PlayerBottomSheetViewModel {
	sheetRootRef: RefObject<HTMLDivElement>;
	sheetMode: SheetMode;
	self: PlayerCombatant | null;
	sheetAc: string;
	sheetHp: string;
	sheetHpMax: string;
	sheetTempHp: string;
	sheetDamage: string;
	damageInputRef: RefObject<HTMLInputElement>;
	damageModeBtnRef: RefObject<HTMLButtonElement>;
	deathDraftFailures: number;
	deathDraftSuccesses: number;
	isDowned: boolean;
	isYourTurn: boolean;
}

interface PlayerBottomSheetActions {
	onSheetAcChange: (value: string) => void;
	onSheetHpChange: (value: string) => void;
	onSheetHpMaxChange: (value: string) => void;
	onSheetTempHpChange: (value: string) => void;
	onSheetDamageChange: (value: string) => void;
	onSetSheetMode: (mode: SheetMode) => void;
	onSaveStats: () => void;
	onApplyDamage: () => void;
	onDeathSaveClick: (track: "failures" | "successes", value: number) => void;
	onConfirmDeath: () => void;
	onConfirmSaved: () => void;
	onEndRound: () => void;
}

interface PlayerBottomSheetProps {
	view: PlayerBottomSheetViewModel;
	actions: PlayerBottomSheetActions;
}

export function PlayerBottomSheet({ view, actions }: PlayerBottomSheetProps) {
	return (
		<div id="sheetRoot" className="sheet" ref={view.sheetRootRef}>
			<div className="sheet-handle" aria-hidden="true"></div>
			<div id="editPanel" className={`sheet-panel${isPanelOpen(view.sheetMode, "edit") ? " open" : ""}`}>
				<div className="sheet-grid">
					<label>AC<input id="sheetAc" type="number" placeholder="AC" value={view.sheetAc} onInput={(event) => actions.onSheetAcChange(event.currentTarget.value)} /></label>
					<label>HP<input id="sheetHp" type="number" placeholder="HP" value={view.sheetHp} onInput={(event) => actions.onSheetHpChange(event.currentTarget.value)} /></label>
					<label>Max HP<input id="sheetHpMax" type="number" placeholder="Max HP" value={view.sheetHpMax} onInput={(event) => actions.onSheetHpMaxChange(event.currentTarget.value)} /></label>
					<label>Temp HP<input id="sheetTempHp" type="number" placeholder="Temp HP" value={view.sheetTempHp} onInput={(event) => actions.onSheetTempHpChange(event.currentTarget.value)} /></label>
				</div>
			</div>
			<div className="sheet-header">
				<div id="sheetSummary" className={`sheet-summary${isSheetSummaryHidden(view.sheetMode) ? " is-hidden" : ""}`}>
					<div className="sheet-player-summary">
						<div className="sheet-player-main">
							<span className={initiativeClass({
								initiativeCriticalFailure: view.self?.initiativeCriticalFailure,
								initiativeRoll: view.self?.initiativeRoll,
							})}>
								{createHexagonIconElement({ ariaHidden: true })}
								<span>{view.self?.initiative ?? "-"}</span>
							</span>
							<span className="sheet-player-name-block">
								<span className="sheet-player-name">{view.self?.name ?? "-"}</span>
								<span className={hpStateClass(String(view.self?.hpLabel ?? "healthy"))}>{sentenceCaseLabel(String(view.self?.hpLabel ?? "healthy"))}</span>
							</span>
						</div>
						<span className="sheet-player-vitals">
							<span className="sheet-player-heart">{createHeartIconElement({ ariaHidden: true })}</span>
							<span className="sheet-summary-hp">{`${view.self?.hpCurrent ?? "-"}/${view.self?.hpMax ?? "-"}`}</span>
							<span className="sheet-summary-temp">{`+${view.self?.tempHp ?? 0}`}</span>
						</span>
						<span className="sheet-summary-shield">{createShieldIconElement({ ariaHidden: true })}<span>{view.self?.ac ?? "-"}</span></span>
					</div>
				</div>
			</div>
			<div id="damagePanel" className={`sheet-panel${isPanelOpen(view.sheetMode, "damage") ? " open" : ""}`}>
				<div className="sheet-grid">
					<label>Damage / heal<input id="sheetDamage" ref={view.damageInputRef} type="number" placeholder="e.g. 7 damage or -7 heal" value={view.sheetDamage} onInput={(event) => actions.onSheetDamageChange(event.currentTarget.value)} /></label>
				</div>
			</div>
			<div id="deathSavePanel" className={`sheet-panel death-save-panel${isPanelOpen(view.sheetMode, "death") ? " open" : ""}`}>
				<div className="death-save-editor">
					<div className="death-save-editor-row">
						<span className="death-save-editor-icon is-failure" aria-hidden="true">{createSkullIconElement({ ariaHidden: true })}</span>
						<div className="death-save-editor-diamonds">
							{([1, 2, 3] as const).map((value) => (
								<button key={`f-${value}`} type="button" className={`death-save-diamond-btn${value <= view.deathDraftFailures ? " is-filled" : ""}`} onClick={() => actions.onDeathSaveClick("failures", value)}>{value <= view.deathDraftFailures ? "◆" : "◇"}</button>
							))}
						</div>
					</div>
					<div className="death-save-editor-row">
						<span className="death-save-editor-icon is-success" aria-hidden="true">{createHeartIconElement({ ariaHidden: true })}</span>
						<div className="death-save-editor-diamonds">
							{([1, 2, 3] as const).map((value) => (
								<button key={`s-${value}`} type="button" className={`death-save-diamond-btn${value <= view.deathDraftSuccesses ? " is-filled" : ""}`} onClick={() => actions.onDeathSaveClick("successes", value)}>{value <= view.deathDraftSuccesses ? "◆" : "◇"}</button>
							))}
						</div>
					</div>
					<button id="deathSaveCloseBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-static" onClick={() => actions.onSetSheetMode("none")}>Close</button>
					<div id="confirmDeathCta" className={`death-confirm-cta${isDeathConfirmVisible(view.deathDraftFailures) ? " is-visible" : ""}`}>
						<button id="confirmDeathBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent" onClick={actions.onConfirmDeath}>Confirm death</button>
					</div>
					<div id="confirmSavedCta" className={`death-confirm-cta${isDeathConfirmVisible(view.deathDraftSuccesses) ? " is-visible" : ""}`}>
						<button id="confirmSavedBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent" onClick={actions.onConfirmSaved}>Confirm stabilized</button>
					</div>
				</div>
			</div>
			<div id="sheetActions" className={`sheet-actions${isSheetActionsHidden(view.sheetMode) ? " is-hidden" : ""}`}>
				<button id="editModeBtn" type="button" className={view.sheetMode === "edit" ? "is-active" : ""} onClick={() => (view.sheetMode === "edit" ? actions.onSaveStats() : actions.onSetSheetMode("edit"))}>{view.sheetMode === "edit" ? "Save stats" : "Edit stats"}</button>
				<button
					id="damageModeBtn"
					ref={view.damageModeBtnRef}
					type="button"
					className={view.sheetMode === "damage" ? "is-active" : ""}
					onClick={() => {
						if (view.sheetMode === "damage") {
							actions.onApplyDamage();
							return;
						}
						actions.onSetSheetMode("damage");
					}}
				>
					{view.sheetMode === "damage" ? "Apply Damage " : "Damage "}
					<span className="sep">|</span>
					{" Heal"}
				</button>
			</div>
			<div id="sheetDeathCta" className={`sheet-turn-cta${isDeathSaveCtaVisible(view.isDowned, view.sheetMode) ? " is-visible" : " is-hidden"}`}>
				<button id="deathSaveModeBtn" type="button" onClick={() => actions.onSetSheetMode("death")}>Death saves</button>
			</div>
			<div id="sheetTurnCta" className={`sheet-turn-cta${isTurnCtaVisible(view.isYourTurn) ? " is-visible" : ""}`}>
				<button id="endRoundBtn" type="button" disabled={!view.isYourTurn} onClick={actions.onEndRound}>End round</button>
			</div>
		</div>
	);
}
