import { useEffect } from "preact/hooks";
import type { RefObject } from "preact";

export function useSheetOutsideClose(
	enabled: boolean,
	sheetRootRef: RefObject<HTMLDivElement>,
	onOutside: () => void,
): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}
			if (sheetRootRef.current?.contains(target)) {
				return;
			}
			onOutside();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [enabled, sheetRootRef, onOutside]);
}
