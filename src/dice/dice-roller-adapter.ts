import type { App } from "obsidian";

interface DiceRollerApi {
	getRoller?: (formula: string, source?: string) => unknown;
}

interface DiceRollerPlugin {
	api?: DiceRollerApi;
}

interface AppWithPluginHost {
	plugins?: {
		getPlugin?: (id: string) => unknown;
		plugins?: Record<string, unknown>;
	};
}

export class DiceRollerAdapter {
	constructor(private readonly app: App) {}

	isAvailable(): boolean {
		const api = this.resolveApi();
		return Boolean(typeof api?.getRoller === "function");
	}

	async rollFormula(expression: string, source = "encounter-cast"): Promise<number | null> {
		const api = this.resolveApi();
		if (!api || typeof api.getRoller !== "function") {
			return null;
		}

		let roller: unknown;
		try {
			roller = await Promise.resolve(api.getRoller.call(api, expression, source));
		} catch {
			return null;
		}

		if (!roller || typeof roller !== "object") {
			const total = this.extractTotal(roller);
			return total === null ? null : Math.max(1, Math.trunc(total));
		}

		const record = roller as Record<string, unknown>;
		const rollFn = record.roll;
		if (typeof rollFn === "function") {
			try {
				const rollResult = await Promise.resolve((rollFn as () => unknown).call(roller));
				const total = this.extractTotal(rollResult);
				if (total !== null) {
					return Math.max(1, Math.trunc(total));
				}
			} catch {
				// Fall through to inspect known result fields.
			}
		}

		for (const key of ["result", "results", "total", "value"]) {
			const total = this.extractTotal(record[key]);
			if (total !== null) {
				return Math.max(1, Math.trunc(total));
			}
		}

		const total = this.extractTotal(roller);
		return total === null ? null : Math.max(1, Math.trunc(total));
	}

	private resolveApi(): DiceRollerApi | null {
		const host = this.app as unknown as AppWithPluginHost;
		const pluginHost = host.plugins;
		if (!pluginHost) {
			return null;
		}

		const pluginIds = ["obsidian-dice-roller", "dice-roller", "obsidian-dice-roller-plugin"];
		for (const id of pluginIds) {
			const plugin = pluginHost.getPlugin?.(id) as DiceRollerPlugin | null;
			if (plugin?.api) {
				return plugin.api;
			}
		}

		for (const [id, value] of Object.entries(pluginHost.plugins ?? {})) {
			if (!id.toLowerCase().includes("dice")) {
				continue;
			}
			const plugin = value as DiceRollerPlugin;
			if (plugin.api) {
				return plugin.api;
			}
		}

		return null;
	}

	private extractTotal(result: unknown): number | null {
		if (typeof result === "number" && Number.isFinite(result)) {
			return result;
		}
		if (typeof result === "string") {
			const parsed = Number.parseFloat(result);
			return Number.isFinite(parsed) ? parsed : null;
		}
		if (!result || typeof result !== "object") {
			return null;
		}

		const record = result as Record<string, unknown>;
		for (const key of ["total", "result", "value"]) {
			const value = record[key];
			if (typeof value === "number" && Number.isFinite(value)) {
				return value;
			}
		}
		for (const key of ["roll", "rollResult", "data"]) {
			const nested = this.extractTotal(record[key]);
			if (nested !== null) {
				return nested;
			}
		}

		return null;
	}
}
