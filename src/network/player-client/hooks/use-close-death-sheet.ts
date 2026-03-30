import { useEffect } from "preact/hooks";
import type { Dispatch } from "preact/hooks";
import type { PlayerUiAction } from "../player-state";
import type { SheetMode } from "../player-types";

export function useCloseDeathSheetWhenRecovered(
	isDowned: boolean,
	sheetMode: SheetMode,
	dispatch: Dispatch<PlayerUiAction>,
): void {
	useEffect(() => {
		if (!isDowned && sheetMode === "death") {
			dispatch({ type: "SET_SHEET_MODE", value: "none" });
		}
	}, [dispatch, isDowned, sheetMode]);
}
