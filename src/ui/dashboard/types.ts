import type { CombatSession } from "../../encounter/combat-session";
import type { MonsterRecord } from "../../monsters/types";

export interface DashboardViewModel {
	session: CombatSession | null;
	encounterRunning: boolean;
	serverRunning: boolean;
	serverPort: number | null;
	roomToken: string | null;
	inviteUrls: string[];
}

export interface DashboardActions {
	onStartEncounter: () => void;
	onStopEncounter: () => void;
	onStartServer: () => void;
	onStopServer: () => void;
	onCopyInvite: (url: string) => void;
	onNextTurn: () => void;
	onAddMonster: () => void;
	onActivateCombatant: (combatantId: string) => void;
	onMoveCombatant: (combatantId: string, direction: "up" | "down") => void;
	onSetHp: (combatantId: string, value: string) => void;
	onSetAc: (combatantId: string, value: string) => void;
	onSetDexMod: (combatantId: string, value: string) => void;
	onOpenMonster: (monster: MonsterRecord) => void;
	onHoverMonster: (monster: MonsterRecord, anchorEl: HTMLElement) => void;
	onMonsterHoverLeave: () => void;
}

