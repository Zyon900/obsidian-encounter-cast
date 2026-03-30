import { useEffect } from "preact/hooks";
import type { Dispatch } from "preact/hooks";
import type { PlayerUiAction } from "../player-state";
import type { PlayerFacingState } from "../../player-contracts";

type SelfCombatant = PlayerFacingState["combatants"][number] | null;

interface UseSyncSheetFromSelfOptions {
	self: SelfCombatant;
	setSheetAc: (value: string) => void;
	setSheetHp: (value: string) => void;
	setSheetHpMax: (value: string) => void;
	setSheetTempHp: (value: string) => void;
	dispatch: Dispatch<PlayerUiAction>;
}

export function useSyncSheetFromSelf(options: UseSyncSheetFromSelfOptions): void {
	const { self, setSheetAc, setSheetHp, setSheetHpMax, setSheetTempHp, dispatch } = options;
	useEffect(() => {
		if (!self) {
			setSheetAc("");
			setSheetHp("");
			setSheetHpMax("");
			setSheetTempHp("");
			dispatch({ type: "SET_DEATH_DRAFT", failures: 0, successes: 0 });
			return;
		}
		setSheetAc(self.ac === null ? "" : String(self.ac));
		setSheetHp(self.hpCurrent === null ? "" : String(self.hpCurrent));
		setSheetHpMax(self.hpMax === null ? "" : String(self.hpMax));
		setSheetTempHp(String(self.tempHp ?? 0));
		dispatch({
			type: "SET_DEATH_DRAFT",
			failures: Math.max(0, Math.min(3, Math.trunc(self.deathSaveFailures ?? 0))),
			successes: Math.max(0, Math.min(3, Math.trunc(self.deathSaveSuccesses ?? 0))),
		});
	}, [dispatch, self, setSheetAc, setSheetHp, setSheetHpMax, setSheetTempHp]);
}
