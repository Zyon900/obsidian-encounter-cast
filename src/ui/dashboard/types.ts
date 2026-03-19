import type { CombatSession } from "../../encounter/combat-session";
import type { MonsterRecord } from "../../monsters/types";

export interface DashboardViewModel {
	session: CombatSession | null;
	serverRunning: boolean;
	serverPort: number | null;
	roomToken: string | null;
	inviteUrls: string[];
}

export interface DashboardActions {
	onStartServer: () => void;
	onStopServer: () => void;
	onCopyInvite: (url: string) => void;
	onNextTurn: () => void;
	onActivateCombatant: (combatantId: string) => void;
	onMoveCombatant: (combatantId: string, direction: "up" | "down") => void;
	onSetHp: (combatantId: string, value: string) => void;
	onSetAc: (combatantId: string, value: string) => void;
	onOpenMonster: (monster: MonsterRecord) => void;
}
