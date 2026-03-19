import type { FoundationViewModel } from "./types";

interface EncounterCastAppProps {
	state: FoundationViewModel;
}

export function EncounterCastApp({ state }: EncounterCastAppProps) {
	return (
		<div className="encounter-cast-shell">
			<div className="encounter-cast-title">EncounterCast</div>
			<div className="encounter-cast-meta">
				<span className={state.serverRunning ? "is-online" : "is-offline"}>
					{state.serverRunning ? "Server online" : "Server offline"}
				</span>
				{state.serverPort !== null ? <span>Port {state.serverPort}</span> : null}
				<span className={state.monsterReady ? "is-online" : "is-offline"}>
					{state.monsterReady ? `Bestiary ${state.monsterCount}` : "Bestiary offline"}
				</span>
				{state.monsterError ? <span title={state.monsterError}>Cache error</span> : null}
			</div>
		</div>
	);
}
