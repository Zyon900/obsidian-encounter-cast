import { useCallback, useState } from "preact/hooks";

export interface InitiativeState {
	initiativeInput: string;
	setInitiativeInput: (value: string) => void;
	clearInitiativeInput: () => void;
}

export function useInitiativeState(): InitiativeState {
	const [initiativeInput, setInitiativeInput] = useState("");
	const clearInitiativeInput = useCallback(() => {
		setInitiativeInput("");
	}, []);
	return { initiativeInput, setInitiativeInput, clearInitiativeInput };
}
