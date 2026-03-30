interface JoinFormValues {
	joinName: string;
	joinAc: string;
	joinHp: string;
	joinHpMax: string;
	joinTempHp: string;
	joinMessage: string;
}

interface JoinFormActions {
	onJoinNameChange: (value: string) => void;
	onJoinAcChange: (value: string) => void;
	onJoinHpChange: (value: string) => void;
	onJoinHpMaxChange: (value: string) => void;
	onJoinTempHpChange: (value: string) => void;
	onJoin: () => void;
	onShowQr: () => void;
}

interface JoinPanelProps {
	values: JoinFormValues;
	actions: JoinFormActions;
}

export function JoinPanel({ values, actions }: JoinPanelProps) {
	return (
		<div className="panel" id="joinPanel">
			<h3>Join encounter</h3>
			<div className="sheet-grid">
				<label>Name<input id="nameInput" placeholder="Your name" value={values.joinName} onInput={(event) => actions.onJoinNameChange(event.currentTarget.value)} /></label>
				<label>AC<input id="joinAcInput" type="number" placeholder="Optional" value={values.joinAc} onInput={(event) => actions.onJoinAcChange(event.currentTarget.value)} /></label>
				<label>HP<input id="joinHpInput" type="number" placeholder="Optional" value={values.joinHp} onInput={(event) => actions.onJoinHpChange(event.currentTarget.value)} /></label>
				<label>Max HP<input id="joinHpMaxInput" type="number" placeholder="Optional" value={values.joinHpMax} onInput={(event) => actions.onJoinHpMaxChange(event.currentTarget.value)} /></label>
				<label>Temp HP<input id="joinTempHpInput" type="number" placeholder="Optional" value={values.joinTempHp} onInput={(event) => actions.onJoinTempHpChange(event.currentTarget.value)} /></label>
			</div>
			<div className="row"><button id="joinBtn" type="button" onClick={actions.onJoin}>Join</button></div>
			<div className="row"><button id="showQrBtn" className="secondary-btn" type="button" onClick={actions.onShowQr}>Show QR-Code</button></div>
			<div id="joinMsg">{values.joinMessage}</div>
		</div>
	);
}
