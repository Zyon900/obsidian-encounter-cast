import { useState } from "preact/hooks";

export interface JoinFormState {
	joinName: string;
	joinAc: string;
	joinHp: string;
	joinHpMax: string;
	joinTempHp: string;
	setJoinName: (value: string) => void;
	setJoinAc: (value: string) => void;
	setJoinHp: (value: string) => void;
	setJoinHpMax: (value: string) => void;
	setJoinTempHp: (value: string) => void;
}

export function useJoinFormState(): JoinFormState {
	const [joinName, setJoinName] = useState("");
	const [joinAc, setJoinAc] = useState("");
	const [joinHp, setJoinHp] = useState("");
	const [joinHpMax, setJoinHpMax] = useState("");
	const [joinTempHp, setJoinTempHp] = useState("");
	return { joinName, joinAc, joinHp, joinHpMax, joinTempHp, setJoinName, setJoinAc, setJoinHp, setJoinHpMax, setJoinTempHp };
}
