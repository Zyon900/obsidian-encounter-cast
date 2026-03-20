import type { App } from "obsidian";
import type { MonsterManager } from "../../monsters/monster-manager";
import type { MonsterRecord } from "../../monsters/types";
import { AddCombatantChoiceModal } from "./add-combatant-choice-modal";
import { AddCombatantModal } from "./add-combatant-modal";
import { CustomMonsterModal } from "./custom-monster-modal";

export interface MonsterSelection {
	monsterName: string;
	monster: MonsterRecord | null;
}

export function pickMonsterOrCustom(app: App, monsterManager: MonsterManager): Promise<MonsterSelection | null> {
	return pickMonsterOrCustomGeneric<MonsterSelection>(
		app,
		monsterManager,
		(monster) => ({ monsterName: monster.name, monster }),
		(name) => ({ monsterName: name, monster: null }),
	);
}

export function pickMonsterNameOrCustom(app: App, monsterManager: MonsterManager): Promise<string | null> {
	return pickMonsterOrCustomGeneric(
		app,
		monsterManager,
		(monster) => monster.name,
		(name) => name,
	);
}

function pickMonsterOrCustomGeneric<T>(
	app: App,
	monsterManager: MonsterManager,
	mapMonster: (monster: MonsterRecord) => T,
	mapCustomName: (name: string) => T,
): Promise<T | null> {
	return new Promise((resolve) => {
		let finished = false;
		const finish = (value: T | null) => {
			if (finished) {
				return;
			}
			finished = true;
			resolve(value);
		};

		new AddCombatantChoiceModal(app, {
			onChooseMonster: () => {
				new AddCombatantModal(
					app,
					monsterManager,
					(monster) => finish(mapMonster(monster)),
					() => finish(null),
				).open();
			},
			onCustomMonster: () => {
				new CustomMonsterModal(
					app,
					(name) => finish(mapCustomName(name)),
					() => finish(null),
				).open();
			},
			onCancel: () => finish(null),
		}).open();
	});
}
