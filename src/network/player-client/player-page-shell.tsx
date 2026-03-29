export function PlayerPageShell() {
	return (
		<>
			<MainPanels />
			<InitiativeGate />
			<BottomSheet />
		</>
	);
}

function MainPanels() {
	return (
		<div className="wrap">
			<div className="panel" id="joinPanel">
				<h3>Join encounter</h3>
				<div className="sheet-grid">
					<label>Name<input id="nameInput" placeholder="Your name" /></label>
					<label>AC<input id="joinAcInput" type="number" placeholder="Optional" /></label>
					<label>HP<input id="joinHpInput" type="number" placeholder="Optional" /></label>
					<label>Max HP<input id="joinHpMaxInput" type="number" placeholder="Optional" /></label>
					<label>Temp HP<input id="joinTempHpInput" type="number" placeholder="Optional" /></label>
				</div>
				<div className="row"><button id="joinBtn" type="button">Join</button></div>
				<div className="row"><button id="showQrBtn" className="secondary-btn" type="button">Show QR-Code</button></div>
				<div id="joinMsg"></div>
			</div>
			<div className="panel qr-panel" id="qrPanel" hidden>
				<h3>Join via QR-Code</h3>
				<div className="qr-image-wrap">
					<div className="qr-image-frame">
						<img id="qrImage" alt="Join encounter QR code" />
					</div>
				</div>
				<a id="qrLink" className="qr-link" href="#" target="_blank" rel="noopener noreferrer"></a>
				<div className="row"><button id="qrBackBtn" className="secondary-btn" type="button">Back</button></div>
			</div>
			<div id="appPanel" className="app-shell" hidden>
				<div className="app-header row"><strong id="title">Encounter</strong></div>
				<div id="status"></div>
				<div id="list"></div>
			</div>
		</div>
	);
}

function InitiativeGate() {
	return (
		<div id="initiativeGate" className="initiative-gate" aria-live="polite">
			<div className="initiative-gate-card">
				<h2>Roll Initiative!</h2>
				<input id="initiativeGateInput" type="number" inputMode="numeric" placeholder="Initiative total" />
				<div className="initiative-roll-toggle">
					<button id="initiativeNat1Btn" className="initiative-roll-btn hex-only" type="button" aria-label="Natural 1">
						<span className="initiative-mini-hex hex red">
							<svg data-ec-icon="hexagon" viewBox="0 0 32 32" aria-hidden="true"><path /></svg>
							<span>1</span>
						</span>
					</button>
					<button id="initiativeNormalBtn" className="initiative-roll-btn is-active" type="button"><span>Normal</span></button>
					<button id="initiativeNat20Btn" className="initiative-roll-btn hex-only" type="button" aria-label="Natural 20">
						<span className="initiative-mini-hex hex green">
							<svg data-ec-icon="hexagon" viewBox="0 0 32 32" aria-hidden="true"><path /></svg>
							<span>20</span>
						</span>
					</button>
				</div>
				<button id="initiativeGateSubmit" type="button">Submit initiative</button>
			</div>
		</div>
	);
}

function BottomSheet() {
	return (
		<div id="sheetRoot" className="sheet" hidden>
			<div className="sheet-handle" aria-hidden="true"></div>
			<div id="editPanel" className="sheet-panel">
				<div className="sheet-grid">
					<label>AC<input id="sheetAc" type="number" placeholder="AC" /></label>
					<label>HP<input id="sheetHp" type="number" placeholder="HP" /></label>
					<label>Max HP<input id="sheetHpMax" type="number" placeholder="Max HP" /></label>
					<label>Temp HP<input id="sheetTempHp" type="number" placeholder="Temp HP" /></label>
				</div>
			</div>
			<div className="sheet-header">
				<div id="sheetSummary" className="sheet-summary">
					<div className="sheet-player-summary">
						<div className="sheet-player-main">
							<span className="initiative"><svg data-ec-icon="hexagon" viewBox="0 0 32 32" aria-hidden="true"><path /></svg><span>-</span></span>
							<span className="sheet-player-name-block"><span className="sheet-player-name">-</span><span className="sheet-player-health is-healthy">healthy</span></span>
						</div>
						<span className="sheet-player-vitals">
							<span className="sheet-player-heart"><svg data-ec-icon="heart" viewBox="0 0 32 32" aria-hidden="true"><path /></svg></span>
							<span className="sheet-summary-hp">-/-</span>
							<span className="sheet-summary-temp">+0</span>
						</span>
						<span className="sheet-summary-shield"><svg data-ec-icon="shield" viewBox="0 0 32 32" aria-hidden="true"><path /></svg><span>-</span></span>
					</div>
				</div>
			</div>
			<div id="damagePanel" className="sheet-panel">
				<div className="sheet-grid">
					<label>Damage / heal<input id="sheetDamage" type="number" placeholder="e.g. 7 damage or -7 heal" /></label>
				</div>
			</div>
			<DeathSavePanel />
			<div id="sheetActions" className="sheet-actions">
				<button id="editModeBtn" type="button">Edit stats</button>
				<button id="damageModeBtn" type="button">Damage <span className="sep">|</span> Heal</button>
			</div>
			<div id="sheetDeathCta" className="sheet-turn-cta">
				<button id="deathSaveModeBtn" type="button">Death saves</button>
			</div>
			<div id="sheetTurnCta" className="sheet-turn-cta">
				<button id="endRoundBtn" type="button">End round</button>
			</div>
		</div>
	);
}

function DeathSavePanel() {
	return (
		<div id="deathSavePanel" className="sheet-panel death-save-panel">
			<div className="death-save-editor">
				<div className="death-save-editor-row">
					<span className="death-save-editor-icon is-failure" aria-hidden="true">
						<svg data-ec-icon="skull" viewBox="0 0 32 32"><path /></svg>
					</span>
					<div className="death-save-editor-diamonds">
						<button id="deathFail1" type="button" className="death-save-diamond-btn" data-track="failures" data-value="1">◆</button>
						<button id="deathFail2" type="button" className="death-save-diamond-btn" data-track="failures" data-value="2">◆</button>
						<button id="deathFail3" type="button" className="death-save-diamond-btn" data-track="failures" data-value="3">◆</button>
					</div>
				</div>
				<div className="death-save-editor-row">
					<span className="death-save-editor-icon is-success" aria-hidden="true">
						<svg data-ec-icon="heart" viewBox="0 0 32 32"><path /></svg>
					</span>
					<div className="death-save-editor-diamonds">
						<button id="deathSuccess1" type="button" className="death-save-diamond-btn" data-track="successes" data-value="1">◆</button>
						<button id="deathSuccess2" type="button" className="death-save-diamond-btn" data-track="successes" data-value="2">◆</button>
						<button id="deathSuccess3" type="button" className="death-save-diamond-btn" data-track="successes" data-value="3">◆</button>
					</div>
				</div>
				<button id="deathSaveCloseBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-static">Close</button>
				<div id="confirmDeathCta" className="death-confirm-cta">
					<button id="confirmDeathBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent">Confirm death</button>
				</div>
				<div id="confirmSavedCta" className="death-confirm-cta">
					<button id="confirmSavedBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent">Confirm stabilized</button>
				</div>
			</div>
		</div>
	);
}
