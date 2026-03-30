import { createHexagonIconElement } from "../../../../utils/icon-factory-tsx";
import { parseIntOrNull } from "../../player-formatters";
import type { RollType } from "../../player-types";
import { isInitiativeGateOpen } from "../animation-selectors";

interface InitiativeGateProps {
	view: {
		open: boolean;
		playerId: string;
		rollType: RollType;
		initiativeInput: string;
		initiativeInputRef: { current: HTMLInputElement | null };
	};
	actions: {
		onInitiativeInputChange: (value: string) => void;
		onRollTypeChange: (value: RollType) => void;
		onSubmitInitiative: (initiativeTotal: number) => void;
	};
}

export function InitiativeGate({ view, actions }: InitiativeGateProps) {
	return (
		<div id="initiativeGate" className={`initiative-gate${isInitiativeGateOpen(view.open) ? " open" : ""}`} aria-live="polite">
			<div className="initiative-gate-card">
				<h2>Roll Initiative!</h2>
				<input
					id="initiativeGateInput"
					ref={view.initiativeInputRef}
					type="number"
					inputMode="numeric"
					placeholder="Initiative total"
					value={view.initiativeInput}
					onInput={(event) => actions.onInitiativeInputChange(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter") {
							return;
						}
						event.preventDefault();
						const total = parseIntOrNull(view.initiativeInput);
						if (!view.playerId || total === null) {
							return;
						}
						actions.onSubmitInitiative(total);
					}}
				/>
				<div className="initiative-roll-toggle">
					<button
						id="initiativeNat1Btn"
						className={`initiative-roll-btn hex-only${view.rollType === "nat1" ? " is-active" : ""}`}
						type="button"
						aria-label="Natural 1"
						onClick={() => {
							actions.onRollTypeChange("nat1");
							actions.onInitiativeInputChange("1");
						}}
					>
						<span className="initiative-mini-hex hex red">{createHexagonIconElement({ ariaHidden: true })}<span>1</span></span>
					</button>
					<button id="initiativeNormalBtn" className={`initiative-roll-btn${view.rollType === "normal" ? " is-active" : ""}`} type="button" onClick={() => actions.onRollTypeChange("normal")}><span>Normal</span></button>
					<button id="initiativeNat20Btn" className={`initiative-roll-btn hex-only${view.rollType === "nat20" ? " is-active" : ""}`} type="button" aria-label="Natural 20" onClick={() => actions.onRollTypeChange("nat20")}>
						<span className="initiative-mini-hex hex green">{createHexagonIconElement({ ariaHidden: true })}<span>20</span></span>
					</button>
				</div>
				<button
					id="initiativeGateSubmit"
					type="button"
					onClick={() => {
						const total = parseIntOrNull(view.initiativeInput);
						if (!view.playerId || total === null) {
							return;
						}
						actions.onSubmitInitiative(total);
					}}
				>
					Submit initiative
				</button>
			</div>
		</div>
	);
}
