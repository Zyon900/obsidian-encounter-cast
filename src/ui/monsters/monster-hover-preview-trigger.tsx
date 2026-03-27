import { type ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { MonsterRecord } from "../../monsters/types";

interface MonsterHoverPreviewTriggerProps {
	monster: MonsterRecord | null;
	className?: string;
	enabled?: boolean;
	delayMs?: number;
	onHoverInfo: (monster: MonsterRecord, anchorEl: HTMLElement) => void;
	onHoverLeave: () => void;
	children: ComponentChildren;
}

// Reusable hover trigger for Fantasy Statblocks popover previews.
// This keeps timing and cleanup behavior consistent across encounter widget and dashboard surfaces.
export function MonsterHoverPreviewTrigger({
	monster,
	className,
	enabled = true,
	delayMs = 500,
	onHoverInfo,
	onHoverLeave,
	children,
}: MonsterHoverPreviewTriggerProps) {
	const triggerRef = useRef<HTMLSpanElement | null>(null);
	const hoverTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		if (enabled) {
			return;
		}
		if (hoverTimeoutRef.current !== null) {
			window.clearTimeout(hoverTimeoutRef.current);
			hoverTimeoutRef.current = null;
		}
		onHoverLeave();
	}, [enabled, onHoverLeave]);

	useEffect(() => {
		return () => {
			if (hoverTimeoutRef.current !== null) {
				window.clearTimeout(hoverTimeoutRef.current);
				hoverTimeoutRef.current = null;
			}
		};
	}, []);

	const startHoverPreview = () => {
		if (!enabled || !monster || !triggerRef.current) {
			return;
		}

		if (hoverTimeoutRef.current !== null) {
			window.clearTimeout(hoverTimeoutRef.current);
			hoverTimeoutRef.current = null;
		}

		hoverTimeoutRef.current = window.setTimeout(() => {
			hoverTimeoutRef.current = null;
			onHoverInfo(monster, triggerRef.current as HTMLElement);
		}, delayMs);
	};

	const stopHoverPreview = () => {
		if (hoverTimeoutRef.current !== null) {
			window.clearTimeout(hoverTimeoutRef.current);
			hoverTimeoutRef.current = null;
		}
		if (enabled) {
			onHoverLeave();
		}
	};

	return (
		<span
			ref={triggerRef}
			className={className}
			onMouseEnter={startHoverPreview}
			onMouseLeave={stopHoverPreview}
		>
			{children}
		</span>
	);
}
