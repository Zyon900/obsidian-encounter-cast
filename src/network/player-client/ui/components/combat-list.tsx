import type { RefObject } from "preact";
import type { PlayerFacingState } from "../../../player-contracts";
import { createHexagonIconElement, createShieldIconElement } from "../../../../utils/icon-factory-tsx";
import { hpClass, sentenceCaseLabel } from "../../player-formatters";
import { combatantRowClass, initiativeClass } from "../animation-selectors";
import { DeathSaveIndicator } from "./death-save-indicator";

interface CombatListProps {
	round: number;
	encounterRunning: boolean;
	combatants: PlayerFacingState["combatants"];
	activeCombatantId: string | null;
	listRef: RefObject<HTMLDivElement>;
}

export function CombatList({ round, encounterRunning, combatants, activeCombatantId, listRef }: CombatListProps) {
	return (
		<div id="appPanel" className="app-shell">
			<div className="app-header row"><strong id="title">{`Round ${round}`}</strong></div>
			<div id="status">{encounterRunning ? "Combat running" : "Waiting for combat start"}</div>
			<div id="list" ref={listRef}>
				{combatants.map((combatant) => (
					<div
						key={combatant.id}
						className={combatantRowClass({
							isActive: combatant.id === activeCombatantId,
							isSelf: combatant.isSelf,
							isYourTurn: combatant.isSelf && combatant.id === activeCombatantId,
						})}
						data-combatant-id={combatant.id}
					>
						<span className={initiativeClass({
							initiativeCriticalFailure: combatant.initiativeCriticalFailure,
							initiativeRoll: combatant.initiativeRoll,
						})}>
							{createHexagonIconElement({ ariaHidden: true })}
							<span>{combatant.initiative ?? "-"}</span>
						</span>
						<div className="name-block">
							<div className="name">{combatant.name}</div>
							<div className={hpClass(combatant.hpLabel)}>{sentenceCaseLabel(combatant.hpLabel)}</div>
						</div>
						{combatant.isPlayer && combatant.deathState === "down" ? (
							<DeathSaveIndicator
								successes={combatant.deathSaveSuccesses ?? 0}
								failures={combatant.deathSaveFailures ?? 0}
								className="list"
							/>
						) : null}
						<div className="tail">
							<span className={`shield${combatant.isSelf || combatant.isPlayer ? "" : " placeholder"}`}>
								{createShieldIconElement({ ariaHidden: true })}
								<span>{combatant.ac ?? "-"}</span>
							</span>
							{!combatant.isPlayer ? <span className="subtle">Monster</span> : null}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
