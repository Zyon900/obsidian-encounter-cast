/* eslint-disable no-restricted-globals */
import { render } from "preact";
import { useCallback, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { StateSyncPayload } from "../player-contracts";
import { usePlayerActions } from "./actions";
import {
	useActiveCombatantScroll,
	useDamageInputFocus,
	useInitiativeInputFocus,
	useListFlipAnimation,
	usePlayerLeaveBeacon,
	useServerHealthProbe,
	useSheetOutsideClose,
	useThemeVars,
} from "./browser";
import {
	useCloseDeathSheetWhenRecovered,
	useDerivedPlayerState,
	useInitialPlayerRefresh,
	useInitiativeState,
	useJoinFormState,
	useSheetFormState,
	useSyncSheetFromSelf,
} from "./hooks";
import { createInitialUiState, playerUiReducer } from "./player-state";
import { PlayerApiClient, usePlayerEventStream } from "./transport";
import { createInviteLink } from "./utils/player-links";
import { CombatList, InitiativeGate, JoinPanel, KickedScreen, PlayerBottomSheet, QrPanel, ShutdownScreen } from "./ui/components";

function PlayerClientApp() {
	const config = window.__ENCOUNTER_CAST_PLAYER_CONFIG__ ?? { supportUrl: null, theme: null };
	const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
	const [ui, dispatch] = useReducer(playerUiReducer, createInitialUiState(localStorage.getItem("encounter-cast-player-id") ?? ""));
	const [reconnectNonce, setReconnectNonce] = useState(0);
	const sheetRootRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const damageModeBtnRef = useRef<HTMLButtonElement | null>(null);
	const damageInputRef = useRef<HTMLInputElement | null>(null);
	const initiativeInputRef = useRef<HTMLInputElement | null>(null);
	const api = useMemo(() => new PlayerApiClient(token), [token]);

	const joinForm = useJoinFormState();
	const sheetForm = useSheetFormState();
	const initiativeState = useInitiativeState();
	const { stateSync, self, isYourTurn, isDowned, needsInitiative } = useDerivedPlayerState(ui.stateSync);

	const refreshState = useCallback(async () => {
		if (!ui.playerId) {
			return;
		}
		const result = await api.refreshState(ui.playerId);
		if (result.ok && result.state) {
			const nextState: StateSyncPayload = result.state;
			dispatch({ type: "SET_STATE_SYNC", value: nextState });
		}
	}, [api, ui.playerId]);

	const actions = usePlayerActions({
		ui,
		dispatch,
		api,
		refreshState,
		self,
		joinFields: {
			joinName: joinForm.joinName,
			joinAc: joinForm.joinAc,
			joinHp: joinForm.joinHp,
			joinHpMax: joinForm.joinHpMax,
			joinTempHp: joinForm.joinTempHp,
		},
		sheetFields: {
			sheetAc: sheetForm.sheetAc,
			sheetHp: sheetForm.sheetHp,
			sheetHpMax: sheetForm.sheetHpMax,
			sheetTempHp: sheetForm.sheetTempHp,
			sheetDamage: sheetForm.sheetDamage,
		},
		setSheetDamage: sheetForm.setSheetDamage,
		persistPlayerId: (playerId) => {
			localStorage.setItem("encounter-cast-player-id", playerId);
		},
	});

	useListFlipAnimation(listRef, stateSync.playerState.combatants);
	useActiveCombatantScroll({
		listRef,
		activeCombatantId: stateSync.playerState.activeCombatantId,
		sheetVisible: ui.topView === "app",
	});
	useThemeVars(config.theme);
	useDamageInputFocus(ui.sheetMode, damageInputRef, damageModeBtnRef);
	useInitiativeInputFocus(needsInitiative, initiativeInputRef, initiativeState.clearInitiativeInput);
	useSheetOutsideClose(ui.sheetMode === "edit", sheetRootRef, () => {
		dispatch({ type: "SET_SHEET_MODE", value: "none" });
	});
	useServerHealthProbe(Boolean(!ui.playerId && !ui.serverShutDown && ui.topView !== "kicked"), () => {
		dispatch({ type: "SERVER_SHUTDOWN", value: "Encounter server has shut down." });
	});
	usePlayerLeaveBeacon(token, ui.playerId);
	useSyncSheetFromSelf({
		self,
		setSheetAc: sheetForm.setSheetAc,
		setSheetHp: sheetForm.setSheetHp,
		setSheetHpMax: sheetForm.setSheetHpMax,
		setSheetTempHp: sheetForm.setSheetTempHp,
		dispatch,
	});
	useCloseDeathSheetWhenRecovered(isDowned, ui.sheetMode, dispatch);
	useInitialPlayerRefresh(ui.playerId, refreshState);

	usePlayerEventStream({
		token,
		playerId: ui.playerId,
		enabled: Boolean(ui.playerId && ui.topView === "app" && !ui.serverShutDown),
		reconnectNonce,
		onStateSync: (nextState) => {
			const syncedState: StateSyncPayload = nextState;
			dispatch({ type: "SET_STATE_SYNC", value: syncedState });
		},
		onServerShutdown: (message) => {
			dispatch({ type: "SERVER_SHUTDOWN", value: message || "Encounter server has shut down." });
		},
		onPlayerKicked: (message) => {
			localStorage.removeItem("encounter-cast-player-id");
			dispatch({ type: "PLAYER_KICKED", value: message || "You were removed from this encounter." });
		},
		onDisconnected: refreshState,
		onReconnectScheduled: () => {
			setReconnectNonce((value) => value + 1);
		},
	});

	const inviteLink = useMemo(() => createInviteLink(token), [token]);

	const joinPanelValues = useMemo(() => ({
		joinName: joinForm.joinName,
		joinAc: joinForm.joinAc,
		joinHp: joinForm.joinHp,
		joinHpMax: joinForm.joinHpMax,
		joinTempHp: joinForm.joinTempHp,
		joinMessage: ui.joinMessage,
	}), [joinForm.joinAc, joinForm.joinHp, joinForm.joinHpMax, joinForm.joinName, joinForm.joinTempHp, ui.joinMessage]);

	const joinPanelActions = useMemo(() => ({
		onJoinNameChange: joinForm.setJoinName,
		onJoinAcChange: joinForm.setJoinAc,
		onJoinHpChange: joinForm.setJoinHp,
		onJoinHpMaxChange: joinForm.setJoinHpMax,
		onJoinTempHpChange: joinForm.setJoinTempHp,
		onJoin: () => void actions.onJoin(),
		onShowQr: () => dispatch({ type: "SET_TOP_VIEW", value: "qr" }),
	}), [actions, dispatch, joinForm.setJoinAc, joinForm.setJoinHp, joinForm.setJoinHpMax, joinForm.setJoinName, joinForm.setJoinTempHp]);

	const initiativeView = useMemo(() => ({
		open: needsInitiative,
		playerId: ui.playerId,
		rollType: ui.initiativeRollType,
		initiativeInput: initiativeState.initiativeInput,
		initiativeInputRef,
	}), [initiativeState.initiativeInput, needsInitiative, ui.initiativeRollType, ui.playerId]);

	const initiativeActions = useMemo(() => ({
		onInitiativeInputChange: initiativeState.setInitiativeInput,
		onRollTypeChange: (value: typeof ui.initiativeRollType) => dispatch({ type: "SET_INITIATIVE_ROLL_TYPE", value }),
		onSubmitInitiative: actions.onSubmitInitiative,
	}), [actions.onSubmitInitiative, dispatch, initiativeState.setInitiativeInput, ui.initiativeRollType]);

	const sheetView = useMemo(() => ({
		sheetRootRef,
		sheetMode: ui.sheetMode,
		self,
		sheetAc: sheetForm.sheetAc,
		sheetHp: sheetForm.sheetHp,
		sheetHpMax: sheetForm.sheetHpMax,
		sheetTempHp: sheetForm.sheetTempHp,
		sheetDamage: sheetForm.sheetDamage,
		damageInputRef,
		damageModeBtnRef,
		deathDraftFailures: ui.deathDraftFailures,
		deathDraftSuccesses: ui.deathDraftSuccesses,
		isDowned,
		isYourTurn,
	}), [isDowned, isYourTurn, self, sheetForm.sheetAc, sheetForm.sheetDamage, sheetForm.sheetHp, sheetForm.sheetHpMax, sheetForm.sheetTempHp, ui.deathDraftFailures, ui.deathDraftSuccesses, ui.sheetMode]);

	const sheetActions = useMemo(() => ({
		onSheetAcChange: sheetForm.setSheetAc,
		onSheetHpChange: sheetForm.setSheetHp,
		onSheetHpMaxChange: sheetForm.setSheetHpMax,
		onSheetTempHpChange: sheetForm.setSheetTempHp,
		onSheetDamageChange: sheetForm.setSheetDamage,
		onSetSheetMode: (mode: typeof ui.sheetMode) => dispatch({ type: "SET_SHEET_MODE", value: mode }),
		onSaveStats: () => void actions.onSaveStats(),
		onApplyDamage: () => void actions.onApplyDamage(),
		onDeathSaveClick: (track: "failures" | "successes", value: number) => void actions.onDeathSaveClick(track, value),
		onConfirmDeath: actions.onConfirmDeath,
		onConfirmSaved: actions.onConfirmSaved,
		onEndRound: actions.onEndRound,
	}), [actions, dispatch, sheetForm.setSheetAc, sheetForm.setSheetDamage, sheetForm.setSheetHp, sheetForm.setSheetHpMax, sheetForm.setSheetTempHp, ui.sheetMode]);

	if (ui.topView === "shutdown") {
		return <ShutdownScreen supportUrl={config.supportUrl} />;
	}

	if (ui.topView === "kicked") {
		return <KickedScreen message={ui.kickedMessage || "You were removed from this encounter."} />;
	}

	return (
		<>
			<div className="wrap">
				{ui.topView === "join" ? <JoinPanel values={joinPanelValues} actions={joinPanelActions} /> : null}
				{ui.topView === "qr" ? <QrPanel token={token} inviteLink={inviteLink} onBack={() => dispatch({ type: "SET_TOP_VIEW", value: "join" })} /> : null}
				{ui.topView === "app" ? (
					<CombatList
						round={stateSync.playerState.round}
						encounterRunning={stateSync.playerState.encounterRunning}
						combatants={stateSync.playerState.combatants}
						activeCombatantId={stateSync.playerState.activeCombatantId}
						listRef={listRef}
					/>
				) : null}
			</div>

			<InitiativeGate view={initiativeView} actions={initiativeActions} />

			{ui.topView === "app" ? <PlayerBottomSheet view={sheetView} actions={sheetActions} /> : null}
		</>
	);
}

const root = document.getElementById("encounter-cast-player-root");
if (root) {
	render(<PlayerClientApp />, root);
}
