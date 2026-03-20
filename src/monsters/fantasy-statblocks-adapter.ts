import { Component, type App } from "obsidian";
import type { MonsterRecord } from "./types";

const FANTASY_STATBLOCKS_PLUGIN_ID = "obsidian-5e-statblocks";

interface FantasyStatblocksApi {
	getBestiaryCreatures(): unknown[];
	getCreatureFromBestiary(name: string): unknown;
	render(monster: unknown, container: HTMLElement, creatureName?: string): Component;
}

interface FantasyStatblocksPlugin {
	api?: FantasyStatblocksApi;
	openHoverPreview?(monster: unknown): void | Promise<void>;
	openCreatureHoverPreview?(monster: unknown): void | Promise<void>;
	showCreatureHoverPreview?(monster: unknown): void | Promise<void>;
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
	private hoverContainer: HTMLElement | null = null;
	private hoverComponent: Component | null = null;
	private hoverHideTimeout: number | null = null;

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
		const creatureToRender = this.resolveCreatureForRender(plugin, monster);
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

	async openCreatureHoverPreview(monster: MonsterRecord): Promise<void> {
		// Kept for backward compatibility with existing manager calls.
		await this.showCreatureHoverPreview(monster, document.body);
	}

	async showCreatureHoverPreview(monster: MonsterRecord, anchorEl: HTMLElement): Promise<void> {
		const plugin = this.requirePlugin();
		const creatureToRender = this.resolveCreatureForRender(plugin, monster);
		if (!creatureToRender) {
			return;
		}

		const api = plugin.api;
		if (!api?.render) {
			return;
		}

		this.ensureHoverContainer();
		if (!this.hoverContainer) {
			return;
		}

		this.clearHoverHideTimeout();
		this.hideCreatureHoverPreview();
		this.hoverContainer.empty();
        this.hoverContainer.addClass("is-visible");
		this.hoverComponent = api.render(creatureToRender, this.hoverContainer);

		// Reposition multiple times to account for late layout growth while the
		// statblock renderer mounts nested content.
		window.requestAnimationFrame(() => {
			this.positionHoverContainer(anchorEl);
			window.requestAnimationFrame(() => {
				this.positionHoverContainer(anchorEl);
			});
			window.setTimeout(() => {
				this.positionHoverContainer(anchorEl);
			}, 50);
		});
	}

	hideCreatureHoverPreview(): void {
		this.clearHoverHideTimeout();
		this.hoverComponent?.unload();
		this.hoverComponent = null;
		if (this.hoverContainer) {
            this.hoverContainer.removeClass("is-visible");
			this.hoverContainer.empty();
		}
	}

	scheduleHideCreatureHoverPreview(delayMs = 500): void {
		this.clearHoverHideTimeout();
		this.hoverHideTimeout = window.setTimeout(() => {
			this.hoverHideTimeout = null;
			this.hideCreatureHoverPreview();
		}, delayMs);
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

	private resolveCreatureForRender(plugin: FantasyStatblocksPlugin, monster: MonsterRecord): unknown {
		const bestiaryMonster = plugin.api?.getCreatureFromBestiary?.(monster.name);
		return bestiaryMonster ?? monster.raw;
	}

	private ensureHoverContainer(): void {
		if (this.hoverContainer && this.hoverContainer.isConnected) {
			return;
		}

		const container = document.createElement("div");
		container.className = "encounter-cast-hover-preview popover";
		container.addEventListener("mouseenter", () => {
			this.clearHoverHideTimeout();
		});
		container.addEventListener("mouseleave", () => {
			this.hideCreatureHoverPreview();
		});
		document.body.appendChild(container);
		this.hoverContainer = container;
	}

	private positionHoverContainer(anchorEl: HTMLElement): void {
		if (!this.hoverContainer || !this.hoverContainer.isConnected) {
			return;
		}

		const anchorRect = anchorEl.getBoundingClientRect();
		const previewRect = this.hoverContainer.getBoundingClientRect();
		const margin = 12;
		const viewport = this.getViewportBounds();
		const minTop = viewport.top + margin;
		const maxTop = viewport.top + Math.max(margin, viewport.height - previewRect.height - margin);
		const preferredTop = anchorRect.top + window.scrollY;
		const top = this.clamp(preferredTop, minTop, maxTop);

		const minLeft = viewport.left + margin;
		const maxLeft = viewport.left + Math.max(margin, viewport.width - previewRect.width - margin);
		const preferredLeft = anchorRect.right + margin + window.scrollX;
		const fitsRight = preferredLeft + previewRect.width <= viewport.left + viewport.width - margin;
		const candidateLeft = fitsRight
			? preferredLeft
			: Math.max(margin + window.scrollX, anchorRect.left + window.scrollX - previewRect.width - margin);
		const left = this.clamp(candidateLeft, minLeft, maxLeft);

		this.hoverContainer.style.top = `${top}px`;
		this.hoverContainer.style.left = `${left}px`;
		this.correctHorizontalOverflow(margin);
	}

	private clamp(value: number, min: number, max: number): number {
		if (value < min) {
			return min;
		}
		if (value > max) {
			return max;
		}
		return value;
	}

	private getViewportBounds(): { left: number; top: number; width: number; height: number } {
		const viewport = window.visualViewport;
		if (!viewport) {
			return {
				left: window.scrollX,
				top: window.scrollY,
				width: window.innerWidth,
				height: window.innerHeight,
			};
		}

		return {
			left: window.scrollX + viewport.offsetLeft,
			top: window.scrollY + viewport.offsetTop,
			width: viewport.width,
			height: viewport.height,
		};
	}

	private correctHorizontalOverflow(margin: number): void {
		if (!this.hoverContainer) {
			return;
		}

		const viewport = this.getViewportBounds();
		const rect = this.hoverContainer.getBoundingClientRect();
		const leftLimit = viewport.left + margin;
		const rightLimit = viewport.left + viewport.width - margin;
		const currentLeft = Number.parseFloat(this.hoverContainer.style.left);
		if (!Number.isFinite(currentLeft)) {
			return;
		}

		const pageRectLeft = rect.left + window.scrollX;
		const pageRectRight = rect.right + window.scrollX;
		if (pageRectRight > rightLimit) {
			const shiftLeft = pageRectRight - rightLimit;
			this.hoverContainer.style.left = `${Math.max(leftLimit, currentLeft - shiftLeft)}px`;
			return;
		}
		if (pageRectLeft < leftLimit) {
			const shiftRight = leftLimit - pageRectLeft;
			this.hoverContainer.style.left = `${currentLeft + shiftRight}px`;
		}
	}

	private clearHoverHideTimeout(): void {
		if (this.hoverHideTimeout === null) {
			return;
		}
		window.clearTimeout(this.hoverHideTimeout);
		this.hoverHideTimeout = null;
	}
}

