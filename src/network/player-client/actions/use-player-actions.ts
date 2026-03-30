import { useCallback } from "preact/hooks";
import type { Dispatch } from "preact/hooks";
import type { PlayerFacingState, StateSyncPayload } from "../../player-contracts";
import { parseIntOrNull } from "../player-formatters";
import type { PlayerUiAction, PlayerUiState } from "../player-state";
import type { PlayerApiClient } from "../transport";

interface JoinFields {
	joinName: string;
	joinAc: string;
	joinHp: string;
	joinHpMax: string;
	joinTempHp: string;
}

interface SheetFields {
	sheetAc: string;
	sheetHp: string;
	sheetHpMax: string;
	sheetTempHp: string;
	sheetDamage: string;
}

type SelfCombatant = PlayerFacingState["combatants"][number] | null;

interface UsePlayerActionsOptions {
	ui: PlayerUiState;
	dispatch: Dispatch<PlayerUiAction>;
	api: PlayerApiClient;
	refreshState: () => Promise<void>;
	self: SelfCombatant;
	joinFields: JoinFields;
	sheetFields: SheetFields;
	setSheetDamage: (value: string) => void;
	persistPlayerId: (playerId: string) => void;
}

interface PlayerActionHandlers {
	onJoin: () => Promise<void>;
	onSaveStats: () => Promise<void>;
	onApplyDamage: () => Promise<void>;
	onDeathSaveClick: (track: "failures" | "successes", value: number) => Promise<void>;
	onSubmitInitiative: (initiativeTotal: number) => void;
	onConfirmDeath: () => void;
	onConfirmSaved: () => void;
	onEndRound: () => void;
}

export function usePlayerActions(options: UsePlayerActionsOptions): PlayerActionHandlers {
	const {
		ui,
		dispatch,
		api,
		refreshState,
		self,
		joinFields,
		sheetFields,
		setSheetDamage,
		persistPlayerId,
	} = options;

	const onJoin = useCallback(async () => {
		const name = joinFields.joinName.trim();
		if (!name.length) {
			dispatch({ type: "SET_JOIN_MESSAGE", value: "Name is required." });
			return;
		}
		const joined = await api.join({ name, playerId: ui.playerId || undefined });
		if (!joined.ok || !joined.player || !joined.state) {
			dispatch({ type: "SET_JOIN_MESSAGE", value: joined.error ?? "Join failed." });
			return;
		}
		const nextPlayerId = joined.player.playerId;
		persistPlayerId(nextPlayerId);
		dispatch({ type: "SET_PLAYER_ID", value: nextPlayerId });
		dispatch({ type: "SET_TOP_VIEW", value: "app" });
		const joinedState: StateSyncPayload = joined.state;
		dispatch({ type: "SET_STATE_SYNC", value: joinedState });
		dispatch({ type: "SET_JOIN_MESSAGE", value: "" });
		const parsedAc = parseIntOrNull(joinFields.joinAc);
		const parsedHp = parseIntOrNull(joinFields.joinHp);
		const parsedHpMax = parseIntOrNull(joinFields.joinHpMax);
		const parsedTemp = parseIntOrNull(joinFields.joinTempHp);
		if (parsedAc !== null || parsedHp !== null || parsedHpMax !== null || parsedTemp !== null) {
			await api.updatePlayer({
				playerId: nextPlayerId,
				ac: parsedAc,
				hpCurrent: parsedHp,
				hpMax: parsedHpMax,
				tempHp: parsedTemp ?? 0,
			});
			await refreshState();
		}
	}, [api, dispatch, joinFields.joinAc, joinFields.joinHp, joinFields.joinHpMax, joinFields.joinName, joinFields.joinTempHp, persistPlayerId, refreshState, ui.playerId]);

	const onSaveStats = useCallback(async () => {
		if (!ui.playerId) {
			return;
		}
		await api.updatePlayer({
			playerId: ui.playerId,
			ac: parseIntOrNull(sheetFields.sheetAc),
			hpCurrent: parseIntOrNull(sheetFields.sheetHp),
			hpMax: parseIntOrNull(sheetFields.sheetHpMax),
			tempHp: parseIntOrNull(sheetFields.sheetTempHp) ?? 0,
		});
		await refreshState();
		dispatch({ type: "SET_SHEET_MODE", value: "none" });
	}, [api, dispatch, refreshState, sheetFields.sheetAc, sheetFields.sheetHp, sheetFields.sheetHpMax, sheetFields.sheetTempHp, ui.playerId]);

	const onApplyDamage = useCallback(async () => {
		if (!ui.playerId || !self) {
			return;
		}
		const rawDamage = parseIntOrNull(sheetFields.sheetDamage);
		if (rawDamage === null) {
			dispatch({ type: "SET_SHEET_MODE", value: "none" });
			return;
		}
		let hpCurrent = self.hpCurrent ?? 0;
		const hpMax = self.hpMax;
		let tempHp = self.tempHp ?? 0;
		if (rawDamage >= 0) {
			const remainingAfterTemp = Math.max(0, rawDamage - tempHp);
			tempHp = Math.max(0, tempHp - rawDamage);
			hpCurrent = Math.max(0, hpCurrent - remainingAfterTemp);
		} else {
			const heal = Math.abs(rawDamage);
			hpCurrent = hpMax === null ? hpCurrent + heal : Math.min(hpMax, hpCurrent + heal);
		}
		await api.updatePlayer({ playerId: ui.playerId, hpCurrent, tempHp });
		await refreshState();
		setSheetDamage("");
		dispatch({ type: "SET_SHEET_MODE", value: "none" });
	}, [api, dispatch, refreshState, self, setSheetDamage, sheetFields.sheetDamage, ui.playerId]);

	const onDeathSaveClick = useCallback(async (track: "failures" | "successes", value: number) => {
		if (!ui.playerId || !self || self.deathState !== "down") {
			return;
		}
		const nextFailures = track === "failures"
			? (value === 1 && ui.deathDraftFailures === 1 ? 0 : value)
			: ui.deathDraftFailures;
		const nextSuccesses = track === "successes"
			? (value === 1 && ui.deathDraftSuccesses === 1 ? 0 : value)
			: ui.deathDraftSuccesses;
		dispatch({ type: "SET_DEATH_DRAFT", failures: nextFailures, successes: nextSuccesses });
		await api.updateDeathSaves({
			playerId: ui.playerId,
			failures: nextFailures,
			successes: nextSuccesses,
		});
		await refreshState();
	}, [api, dispatch, refreshState, self, ui.deathDraftFailures, ui.deathDraftSuccesses, ui.playerId]);

	const onSubmitInitiative = useCallback((initiativeTotal: number) => {
		if (!ui.playerId) {
			return;
		}
		void api.submitInitiative({ playerId: ui.playerId, initiativeTotal, rollType: ui.initiativeRollType }).then(refreshState);
	}, [api, refreshState, ui.initiativeRollType, ui.playerId]);

	const onConfirmDeath = useCallback(() => {
		if (!ui.playerId) {
			return;
		}
		void api.updateDeathSaves({ playerId: ui.playerId, confirm: "dead" })
			.then(refreshState)
			.then(() => dispatch({ type: "SET_SHEET_MODE", value: "none" }));
	}, [api, dispatch, refreshState, ui.playerId]);

	const onConfirmSaved = useCallback(() => {
		if (!ui.playerId) {
			return;
		}
		void api.updateDeathSaves({ playerId: ui.playerId, confirm: "saved" })
			.then(refreshState)
			.then(() => dispatch({ type: "SET_SHEET_MODE", value: "none" }));
	}, [api, dispatch, refreshState, ui.playerId]);

	const onEndRound = useCallback(() => {
		if (!ui.playerId) {
			return;
		}
		void api.endTurn({ playerId: ui.playerId }).then(refreshState);
	}, [api, refreshState, ui.playerId]);

	return {
		onJoin,
		onSaveStats,
		onApplyDamage,
		onDeathSaveClick,
		onSubmitInitiative,
		onConfirmDeath,
		onConfirmSaved,
		onEndRound,
	};
}
