export interface FoundationViewModel {
	serverRunning: boolean;
	serverPort: number | null;
	monsterReady: boolean;
	monsterCount: number;
	monsterError: string | null;
}
