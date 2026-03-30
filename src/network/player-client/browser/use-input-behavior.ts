import { useEffect } from "preact/hooks";
import type { RefObject } from "preact";

function ensureDamageActionVisible(button: HTMLButtonElement | null): void {
	if (!button) {
		return;
	}
	const viewportBottom = window.visualViewport
		? window.visualViewport.offsetTop + window.visualViewport.height
		: window.innerHeight;
	const buttonRect = button.getBoundingClientRect();
	const keyboardAccessoryGuard = window.visualViewport && window.matchMedia("(pointer: coarse)").matches ? 62 : 0;
	const safeBottom = viewportBottom - (10 + keyboardAccessoryGuard);
	if (buttonRect.bottom > safeBottom) {
		window.scrollBy({ top: buttonRect.bottom - safeBottom, behavior: "smooth" });
	}
}

export function useDamageInputFocus(
	sheetMode: string,
	damageInputRef: RefObject<HTMLInputElement>,
	damageModeBtnRef: RefObject<HTMLButtonElement>,
): void {
	useEffect(() => {
		if (sheetMode !== "damage") {
			return;
		}
		const timer = window.setTimeout(() => {
			damageInputRef.current?.focus();
			damageInputRef.current?.select();
			ensureDamageActionVisible(damageModeBtnRef.current);
		}, 20);
		return () => clearTimeout(timer);
	}, [sheetMode, damageInputRef, damageModeBtnRef]);
}

export function useInitiativeInputFocus(
	needsInitiative: boolean,
	initiativeInputRef: RefObject<HTMLInputElement>,
	onInitiativeClosed: () => void,
): void {
	useEffect(() => {
		if (!needsInitiative) {
			onInitiativeClosed();
			return;
		}
		const timer = window.setTimeout(() => {
			initiativeInputRef.current?.focus();
			initiativeInputRef.current?.select();
		}, 30);
		return () => clearTimeout(timer);
	}, [needsInitiative, initiativeInputRef, onInitiativeClosed]);
}
