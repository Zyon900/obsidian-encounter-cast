import { useLayoutEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";

interface ActiveCombatantScrollOptions {
	listRef: RefObject<HTMLDivElement>;
	activeCombatantId: string | null;
	sheetVisible: boolean;
}

export function useActiveCombatantScroll(options: ActiveCombatantScrollOptions): void {
	const { listRef, activeCombatantId, sheetVisible } = options;
	const previousActiveRef = useRef<string | null>(null);

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list || !activeCombatantId || previousActiveRef.current === activeCombatantId) {
			previousActiveRef.current = activeCombatantId;
			return;
		}
		const activeRow = list.querySelector<HTMLElement>(`[data-combatant-id="${activeCombatantId}"]`);
		if (!activeRow) {
			previousActiveRef.current = activeCombatantId;
			return;
		}
		const rowRect = activeRow.getBoundingClientRect();
		const sheetInset = sheetVisible ? 260 : 0;
		const topLimit = 8;
		const bottomLimit = window.innerHeight - sheetInset - 8;
		if (rowRect.bottom > bottomLimit) {
			window.scrollBy({ top: rowRect.bottom - bottomLimit, behavior: "smooth" });
		} else if (rowRect.top < topLimit) {
			window.scrollBy({ top: rowRect.top - topLimit, behavior: "smooth" });
		}
		previousActiveRef.current = activeCombatantId;
	}, [activeCombatantId, listRef, sheetVisible]);
}
