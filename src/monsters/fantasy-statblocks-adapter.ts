import type { App } from "obsidian";
import type { MonsterRecord } from "./types";

const FANTASY_STATBLOCKS_PLUGIN_ID = "obsidian-5e-statblocks";

interface FantasyStatblocksApi {
	getBestiaryCreatures(): unknown[];
	getCreatureFromBestiary(name: string): unknown;
}

interface FantasyStatblocksPlugin {
	api?: FantasyStatblocksApi;
	creature_view?: {
		render(monster: unknown): void | Promise<void>;
		leaf?: unknown;
	};
	openCreatureView?(forceNew?: boolean): Promise<unknown>;
}

interface AppWithPluginHost {
	plugins: {
		getPlugin(id: string): unknown;
	};
	commands: {
		executeCommandById(id: string): Promise<boolean>;
	};
}

export class FantasyStatblocksAdapter {
	constructor(private readonly app: App) {}

	getCreatures(): unknown[] {
		const plugin = this.requirePlugin();
		const creatures = plugin.api?.getBestiaryCreatures?.();
		if (!Array.isArray(creatures)) {
			throw new Error("Fantasy Statblocks API did not return creature data.");
		}
		return creatures;
	}

	async openCreaturePreview(monster: MonsterRecord): Promise<void> {
		const plugin = this.requirePlugin();
		const bestiaryMonster = plugin.api?.getCreatureFromBestiary?.(monster.name);
		const creatureToRender = bestiaryMonster ?? monster.raw;
		if (!creatureToRender) {
			throw new Error(`Unable to open creature preview for "${monster.name}".`);
		}

		if (!plugin.creature_view && plugin.openCreatureView) {
			await plugin.openCreatureView(false);
		}

		if (!plugin.creature_view) {
			await this.host.commands.executeCommandById("obsidian-5e-statblocks:open-creature-view");
		}

		if (!plugin.creature_view) {
			throw new Error("Fantasy Statblocks creature pane is unavailable.");
		}

		await plugin.creature_view.render(creatureToRender);
	}

	private requirePlugin(): FantasyStatblocksPlugin {
		const plugin = this.host.plugins.getPlugin(FANTASY_STATBLOCKS_PLUGIN_ID) as FantasyStatblocksPlugin | null;
		if (!plugin) {
			throw new Error("Fantasy Statblocks plugin is not enabled.");
		}
		if (!plugin.api) {
			throw new Error("Fantasy Statblocks API is not available yet.");
		}
		return plugin;
	}

	private get host(): AppWithPluginHost {
		return this.app as unknown as AppWithPluginHost;
	}
}