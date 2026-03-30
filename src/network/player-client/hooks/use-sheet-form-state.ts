import { useState } from "preact/hooks";

export interface SheetFormState {
	sheetAc: string;
	sheetHp: string;
	sheetHpMax: string;
	sheetTempHp: string;
	sheetDamage: string;
	setSheetAc: (value: string) => void;
	setSheetHp: (value: string) => void;
	setSheetHpMax: (value: string) => void;
	setSheetTempHp: (value: string) => void;
	setSheetDamage: (value: string) => void;
}

export function useSheetFormState(): SheetFormState {
	const [sheetAc, setSheetAc] = useState("");
	const [sheetHp, setSheetHp] = useState("");
	const [sheetHpMax, setSheetHpMax] = useState("");
	const [sheetTempHp, setSheetTempHp] = useState("");
	const [sheetDamage, setSheetDamage] = useState("");
	return { sheetAc, sheetHp, sheetHpMax, sheetTempHp, sheetDamage, setSheetAc, setSheetHp, setSheetHpMax, setSheetTempHp, setSheetDamage };
}
