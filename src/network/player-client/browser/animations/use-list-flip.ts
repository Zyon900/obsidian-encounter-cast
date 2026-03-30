import { useLayoutEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import type { PlayerFacingState } from "../../../player-contracts";

export function useListFlipAnimation(
	listRef: RefObject<HTMLDivElement>,
	combatants: PlayerFacingState["combatants"],
): void {
	const previousRectsRef = useRef(new Map<string, DOMRect>());
	const previousOrderKeyRef = useRef("");
	const hasRenderedRef = useRef(false);

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list) {
			return;
		}
		const previousRects = previousRectsRef.current;
		const nextRects = new Map<string, DOMRect>();
		const nodes = list.querySelectorAll<HTMLElement>("[data-combatant-id]");
		const orderKey = combatants.map((combatant) => combatant.id).join("|");
		const orderChanged = hasRenderedRef.current && previousOrderKeyRef.current !== orderKey;

		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes.item(index);
			if (!node) {
				continue;
			}
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			nextRects.set(id, node.getBoundingClientRect());
		}

		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes.item(index);
			if (!node) {
				continue;
			}
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			const previousRect = previousRects.get(id);
			if (!previousRect) {
				if (hasRenderedRef.current) {
					node.animate(
						[
							{ opacity: 0, transform: "translateY(8px) scale(0.985)" },
							{ opacity: 1, transform: "translateY(0) scale(1)" },
						],
						{ duration: 190, easing: "cubic-bezier(0.2, 0, 0, 1)" },
					);
				}
				continue;
			}
			if (!orderChanged) {
				continue;
			}
			const currentRect = nextRects.get(id);
			if (!currentRect) {
				continue;
			}
			const deltaX = previousRect.left - currentRect.left;
			const deltaY = previousRect.top - currentRect.top;
			if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
				continue;
			}
			node.animate(
				[
					{ transform: `translate(${deltaX}px, ${deltaY}px)` },
					{ transform: "translate(0, 0)" },
				],
				{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
			);
		}

		previousRectsRef.current = nextRects;
		previousOrderKeyRef.current = orderKey;
		hasRenderedRef.current = true;
	}, [combatants, listRef]);
}
