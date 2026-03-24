/* This file runs in the standalone browser client (not Obsidian plugin runtime), so browser globals are expected here. */
/* eslint-disable no-restricted-globals */
import type { PlayerTheme, StateSyncPayload } from "../player-events";
import {
	asPlayerJoinResult,
	asPlayerStateResult,
	isApiResult,
	isRecord,
	isStateSyncPayload,
	parseJson,
} from "./runtime-guards";
import {
	clearChildren,
	createEl,
	createIconSvg,
	requireEl,
} from "./runtime-dom";
import {
	hpClass,
	hpStateClass,
	parseIntOrNull,
	sentenceCaseLabel,
} from "./runtime-labels";
import {
	createInitiativeBadge,
	createSheetHeart,
	createSheetShield,
	createShield,
} from "./runtime-ui";
import type {
	PlayerCombatant,
	RollType,
	SheetMode,
} from "./runtime-types";

export interface PlayerClientBootConfig {
	supportUrl: string | null;
	theme: PlayerTheme | null;
}

export const PLAYER_CLIENT_RUNTIME_HELPERS = [
	requireEl,
	createEl,
	parseIntOrNull,
	clearChildren,
	createIconSvg,
	createInitiativeBadge,
	createShield,
	createSheetShield,
	createSheetHeart,
	hpClass,
	hpStateClass,
	sentenceCaseLabel,
	isRecord,
	isApiResult,
	isStateSyncPayload,
	asPlayerJoinResult,
	asPlayerStateResult,
	parseJson,
] as const;

export function bootPlayerClient(config: PlayerClientBootConfig): void {
	function applyThemeCssVars(theme: PlayerTheme | null): void {
		if (!theme) {
			return;
		}
		const root = document.documentElement;
		root.style.setProperty("--ec-background-primary", theme.backgroundPrimary);
		root.style.setProperty("--ec-background-secondary", theme.backgroundSecondary);
		root.style.setProperty("--ec-text-normal", theme.textNormal);
		root.style.setProperty("--ec-text-muted", theme.textMuted);
		root.style.setProperty("--ec-text-error", theme.textError);
		root.style.setProperty("--ec-text-success", theme.textSuccess);
		root.style.setProperty("--ec-text-warning", theme.textWarning);
		root.style.setProperty("--ec-text-faint", theme.textFaint);
		root.style.setProperty("--ec-interactive-accent", theme.interactiveAccent);
		root.style.setProperty("--ec-text-on-accent", theme.textOnAccent);
		root.style.setProperty("--ec-border", theme.border);
	}

	function setDamageButtonLabel(isApply: boolean): void {
		clearChildren(damageModeBtn);
		damageModeBtn.append(document.createTextNode(isApply ? "Apply Damage " : "Damage "));
		damageModeBtn.appendChild(createEl("span", { className: "sep", text: "|" }));
		damageModeBtn.append(document.createTextNode(" Heal"));
	}

	function setTopView(view: "join" | "qr" | "app"): void {
		joinPanel.hidden = view !== "join";
		qrPanel.hidden = view !== "qr";
		appPanel.hidden = view !== "app";
		sheetRoot.hidden = view !== "app";
	}

	function renderShutdownScreen(): void {
		const body = document.body;
		clearChildren(body);
		const wrap = createEl("div", { className: "shutdown-screen" });
		const card = createEl("div", { className: "shutdown-card" });
		card.appendChild(createEl("h2", { text: "Thanks for playing!" }));
		const p = createEl("p");
		p.append("If you enjoyed this plugin, consider supporting the author:");
		if (config.supportUrl) {
			p.append(" ");
			const a = createEl("a", { text: "Buy him a coffee!" });
			a.href = config.supportUrl;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			p.appendChild(a);
		} else {
			p.append(" Buy him a coffee!");
		}
		card.appendChild(p);
		wrap.appendChild(card);
		body.appendChild(wrap);
	}

	function renderSheetSummary(self: PlayerCombatant | null): void {
		clearChildren(sheetSummary);
		const row = createEl("div", { className: "sheet-player-summary" });
		const main = createEl("div", { className: "sheet-player-main" });
		const vitals = createEl("span", { className: "sheet-player-vitals" });
		if (!self) {
			main.appendChild(createInitiativeBadge("-", false, false));
			const nameBlock = createEl("span", { className: "sheet-player-name-block" });
			nameBlock.appendChild(createEl("span", { className: "sheet-player-name", text: "-" }));
			nameBlock.appendChild(createEl("span", { className: "sheet-player-health is-healthy", text: "Healthy" }));
			main.appendChild(nameBlock);
			vitals.appendChild(createSheetHeart());
			vitals.appendChild(createEl("span", { className: "sheet-summary-hp", text: "-/-" }));
			vitals.appendChild(createEl("span", { className: "sheet-summary-temp", text: "+0" }));
			row.appendChild(main);
			row.appendChild(vitals);
			row.appendChild(createSheetShield("-"));
			sheetSummary.appendChild(row);
			return;
		}

		main.appendChild(createInitiativeBadge(self.initiative ?? "-", self.initiativeCriticalFailure === true, self.initiativeRoll === 20));
		const nameBlock = createEl("span", { className: "sheet-player-name-block" });
		nameBlock.appendChild(createEl("span", { className: "sheet-player-name", text: self.name ?? "-" }));
		nameBlock.appendChild(
			createEl("span", {
				className: hpStateClass(String(self.hpLabel ?? "healthy")),
				text: sentenceCaseLabel(String(self.hpLabel ?? "healthy")),
			}),
		);
		main.appendChild(nameBlock);
		vitals.appendChild(createSheetHeart());
		vitals.appendChild(createEl("span", { className: "sheet-summary-hp", text: `${self.hpCurrent ?? "-"}/${self.hpMax ?? "-"}` }));
		vitals.appendChild(createEl("span", { className: "sheet-summary-temp", text: `+${self.tempHp ?? 0}` }));
		row.appendChild(main);
		row.appendChild(vitals);
		row.appendChild(createSheetShield(self.ac ?? "-"));
		sheetSummary.appendChild(row);
	}

	function buildCombatantRow(c: PlayerCombatant, activeCombatantId: string | null): HTMLDivElement {
		const row = createEl("div", {
			className:
				`combatant${c.id === activeCombatantId ? " active" : ""}` +
				`${c.isSelf ? " is-self" : ""}` +
				`${c.isSelf && c.id === activeCombatantId ? " is-your-turn" : ""}`,
		});
		row.dataset.combatantId = c.id;
		row.appendChild(createInitiativeBadge(c.initiative ?? "-", c.initiativeCriticalFailure === true, c.initiativeRoll === 20));
		const nameBlock = createEl("div", { className: "name-block" });
		nameBlock.appendChild(createEl("div", { className: "name", text: c.name }));
		nameBlock.appendChild(createEl("div", { className: hpClass(c.hpLabel), text: sentenceCaseLabel(c.hpLabel) }));
		row.appendChild(nameBlock);
		const tail = createEl("div", { className: "tail" });
		const showAc = c.isSelf || c.isPlayer;
		tail.appendChild(createShield(c.ac ?? "-", !showAc));
		if (!c.isPlayer) {
			tail.appendChild(createEl("span", { className: "subtle", text: "Monster" }));
		}
		row.appendChild(tail);
		return row;
	}

	applyThemeCssVars(config.theme);

	const token = new URLSearchParams(window.location.search).get("token") ?? "";

	const joinPanel = requireEl<HTMLDivElement>("joinPanel");
	const appPanel = requireEl<HTMLDivElement>("appPanel");
	const nameInput = requireEl<HTMLInputElement>("nameInput");
	const joinAcInput = requireEl<HTMLInputElement>("joinAcInput");
	const joinHpInput = requireEl<HTMLInputElement>("joinHpInput");
	const joinHpMaxInput = requireEl<HTMLInputElement>("joinHpMaxInput");
	const joinTempHpInput = requireEl<HTMLInputElement>("joinTempHpInput");
	const joinBtn = requireEl<HTMLButtonElement>("joinBtn");
	const joinMsg = requireEl<HTMLDivElement>("joinMsg");
	const showQrBtn = requireEl<HTMLButtonElement>("showQrBtn");
	const qrPanel = requireEl<HTMLDivElement>("qrPanel");
	const qrImage = requireEl<HTMLImageElement>("qrImage");
	const qrLink = requireEl<HTMLAnchorElement>("qrLink");
	const qrBackBtn = requireEl<HTMLButtonElement>("qrBackBtn");
	const statusEl = requireEl<HTMLDivElement>("status");
	const listEl = requireEl<HTMLDivElement>("list");
	const initiativeGate = requireEl<HTMLDivElement>("initiativeGate");
	const initiativeGateInput = requireEl<HTMLInputElement>("initiativeGateInput");
	const initiativeNat1Btn = requireEl<HTMLButtonElement>("initiativeNat1Btn");
	const initiativeNormalBtn = requireEl<HTMLButtonElement>("initiativeNormalBtn");
	const initiativeNat20Btn = requireEl<HTMLButtonElement>("initiativeNat20Btn");
	const initiativeGateSubmit = requireEl<HTMLButtonElement>("initiativeGateSubmit");
	const titleEl = requireEl<HTMLElement>("title");
	const sheetRoot = requireEl<HTMLDivElement>("sheetRoot");
	const sheetSummary = requireEl<HTMLDivElement>("sheetSummary");
	const editModeBtn = requireEl<HTMLButtonElement>("editModeBtn");
	const damageModeBtn = requireEl<HTMLButtonElement>("damageModeBtn");
	const editPanel = requireEl<HTMLDivElement>("editPanel");
	const damagePanel = requireEl<HTMLDivElement>("damagePanel");
	const sheetAc = requireEl<HTMLInputElement>("sheetAc");
	const sheetHp = requireEl<HTMLInputElement>("sheetHp");
	const sheetHpMax = requireEl<HTMLInputElement>("sheetHpMax");
	const sheetTempHp = requireEl<HTMLInputElement>("sheetTempHp");
	const sheetDamage = requireEl<HTMLInputElement>("sheetDamage");
	const sheetTurnCta = requireEl<HTMLDivElement>("sheetTurnCta");
	const endRoundBtn = requireEl<HTMLButtonElement>("endRoundBtn");

	let playerId = localStorage.getItem("encounter-cast-player-id") ?? "";
	let stream: EventSource | null = null;
	let serverShutDown = false;
	let availabilityCheckTimer: number | null = null;
	let lastState: StateSyncPayload | null = null;
	let sheetMode: SheetMode = "none";
	let initiativeGateOpen = false;
	let initiativeRollType: RollType = "normal";
	let lastActiveCombatantId: string | null = null;
	let previousCombatantOrderKey = "";
	let hasRenderedCombatants = false;

	async function api(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<unknown> {
		const url = `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
		const response = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return await response.json();
	}

	function buildInviteLink(): string {
		const inviteUrl = new URL(window.location.href);
		inviteUrl.searchParams.set("token", token);
		inviteUrl.searchParams.delete("playerId");
		return inviteUrl.toString();
	}

	function readNumById(id: string): number | null {
		const el = requireEl<HTMLInputElement>(id);
		return parseIntOrNull(el.value);
	}

	function readOptionalInputNumber(el: HTMLInputElement): number | null {
		return parseIntOrNull(el.value);
	}

	function handleServerShutdown(message: string): void {
		if (serverShutDown) {
			return;
		}
		serverShutDown = true;
		if (availabilityCheckTimer !== null) {
			clearInterval(availabilityCheckTimer);
			availabilityCheckTimer = null;
		}
		stream?.close();
		stream = null;
		statusEl.textContent = message || "Encounter server has shut down.";
		closeInitiativeGate();
		clearChildren(listEl);
		renderShutdownScreen();
	}

	function openQrPanel(): void {
		if (playerId) {
			return;
		}
		const inviteUrl = buildInviteLink();
		qrLink.href = inviteUrl;
		qrLink.textContent = inviteUrl;
		qrImage.src = `/api/invite-qr?token=${encodeURIComponent(token)}&v=${Date.now()}`;
		setTopView("qr");
	}

	function openJoinPanel(): void {
		if (playerId) {
			return;
		}
		setTopView("join");
	}

	async function checkServerAvailability(): Promise<void> {
		if (serverShutDown || playerId) {
			return;
		}
		try {
			const response = await fetch("/health", { cache: "no-store" });
			if (!response.ok) {
				throw new Error("Health endpoint unavailable.");
			}
		} catch {
			handleServerShutdown("Encounter server has shut down.");
		}
	}

	function setSheetMode(mode: SheetMode): void {
		sheetMode = mode;
		const isEdit = mode === "edit";
		const isDamage = mode === "damage";
		editPanel.classList.toggle("open", isEdit);
		damagePanel.classList.toggle("open", isDamage);
		editModeBtn.classList.toggle("is-active", isEdit);
		damageModeBtn.classList.toggle("is-active", isDamage);
		editModeBtn.classList.toggle("is-hidden", isDamage);
		sheetSummary.classList.toggle("is-hidden", isEdit);
		editModeBtn.textContent = isEdit ? "Save stats" : "Edit stats";
		setDamageButtonLabel(isDamage);
		if (isDamage) {
			setTimeout(() => {
				sheetDamage.focus();
				sheetDamage.select();
				ensureDamageActionVisible();
			}, 20);
			setTimeout(ensureDamageActionVisible, 220);
			setTimeout(ensureDamageActionVisible, 420);
		}
	}

	function handleAsyncError(error: unknown): void {
		console.error("[encounter-cast] player client handler failed", error);
	}

	function setSheetFromSelf(self: PlayerCombatant | null): void {
		renderSheetSummary(self);
		if (!self) {
			sheetAc.value = "";
			sheetHp.value = "";
			sheetHpMax.value = "";
			sheetTempHp.value = "";
			if (sheetMode !== "damage") {
				sheetDamage.value = "";
			}
			return;
		}
		sheetAc.value = self.ac === null ? "" : String(self.ac);
		sheetHp.value = self.hpCurrent === null ? "" : String(self.hpCurrent);
		sheetHpMax.value = self.hpMax === null ? "" : String(self.hpMax);
		sheetTempHp.value = String(self.tempHp ?? 0);
		if (sheetMode !== "damage") {
			sheetDamage.value = "";
		}
	}

	function cancelSheetEdit(): void {
		if (sheetMode !== "edit") {
			return;
		}
		const self = lastState?.playerState.combatants.find((combatant) => combatant.isSelf) ?? null;
		setSheetFromSelf(self);
		setSheetMode("none");
	}

	async function saveFromSheet(): Promise<void> {
		if (!playerId) {
			return;
		}
		await api("/api/player/update", "POST", {
			playerId,
			ac: readNumById("sheetAc"),
			hpCurrent: readNumById("sheetHp"),
			hpMax: readNumById("sheetHpMax"),
			tempHp: readNumById("sheetTempHp") ?? 0,
		});
		await refresh();
		setSheetMode("none");
	}

	async function applyDamageFromSheet(): Promise<void> {
		if (!playerId || !lastState) {
			return;
		}
		const self = lastState.playerState.combatants.find((c) => c.isSelf);
		if (!self) {
			return;
		}
		const rawDamage = readNumById("sheetDamage");
		if (rawDamage === null) {
			setSheetMode("none");
			return;
		}
		let hpCurrent = self.hpCurrent ?? 0;
		const hpMax = self.hpMax;
		let tempHp = self.tempHp ?? 0;
		if (rawDamage >= 0) {
			const remainingAfterTemp = Math.max(0, rawDamage - tempHp);
			tempHp = Math.max(0, tempHp - rawDamage);
			hpCurrent = Math.max(0, hpCurrent - remainingAfterTemp);
		} else {
			const heal = Math.abs(rawDamage);
			const unclamped = hpCurrent + heal;
			hpCurrent = hpMax === null ? unclamped : Math.min(hpMax, unclamped);
		}
		await api("/api/player/update", "POST", { playerId, hpCurrent, tempHp });
		await refresh();
		sheetDamage.value = "";
		setSheetMode("none");
	}

	function setInitiativeRollType(nextType: RollType): void {
		initiativeRollType = nextType;
		initiativeNat1Btn.classList.toggle("is-active", nextType === "nat1");
		initiativeNormalBtn.classList.toggle("is-active", nextType === "normal");
		initiativeNat20Btn.classList.toggle("is-active", nextType === "nat20");
	}

	function scrollRowIntoVisibleArea(row: HTMLElement): void {
		const rowRect = row.getBoundingClientRect();
		const sheetInset = !sheetRoot.hidden ? sheetRoot.offsetHeight : 0;
		const topLimit = 8;
		const bottomLimit = window.innerHeight - sheetInset - 8;
		if (rowRect.bottom > bottomLimit) {
			window.scrollBy({ top: rowRect.bottom - bottomLimit, behavior: "smooth" });
			return;
		}
		if (rowRect.top < topLimit) {
			window.scrollBy({ top: rowRect.top - topLimit, behavior: "smooth" });
		}
	}

	function ensureDamageActionVisible(): void {
		if (sheetMode !== "damage") {
			return;
		}
		const viewportBottom = window.visualViewport
			? window.visualViewport.offsetTop + window.visualViewport.height
			: window.innerHeight;
		const buttonRect = damageModeBtn.getBoundingClientRect();
		const isTouchLike = window.matchMedia("(pointer: coarse)").matches;
		const keyboardAccessoryGuard = window.visualViewport && isTouchLike ? 62 : 0;
		const safeBottom = viewportBottom - (10 + keyboardAccessoryGuard);
		if (buttonRect.bottom > safeBottom) {
			window.scrollBy({ top: buttonRect.bottom - safeBottom, behavior: "smooth" });
		}
	}

	function openInitiativeGate(): void {
		if (initiativeGateOpen) {
			return;
		}
		initiativeGateOpen = true;
		setInitiativeRollType("normal");
		document.body.classList.add("initiative-modal-open");
		initiativeGate.classList.add("open");
		setTimeout(() => {
			initiativeGateInput.focus();
			initiativeGateInput.select();
		}, 30);
	}

	function closeInitiativeGate(): void {
		initiativeGateOpen = false;
		initiativeGate.classList.remove("open");
		document.body.classList.remove("initiative-modal-open");
		initiativeGateInput.value = "";
	}

	function render(state: StateSyncPayload): void {
		lastState = state;
		const ps = state.playerState;
		titleEl.textContent = `Round ${ps.round}`;
		statusEl.textContent = ps.encounterRunning ? "Combat running" : "Waiting for combat start";

		const self = ps.combatants.find((c) => c.isSelf);
		const active = ps.activeCombatantId;
		const isYourTurn = Boolean(self && ps.encounterRunning && self.id === active);
		endRoundBtn.disabled = !isYourTurn;
		sheetTurnCta.classList.toggle("is-visible", isYourTurn);
		editModeBtn.disabled = !self;
		damageModeBtn.disabled = !self;
		setSheetFromSelf(self ?? null);

		const needsInitiative = Boolean(self && ps.encounterRunning && self.initiative === null);
		if (needsInitiative) {
			openInitiativeGate();
		} else {
			closeInitiativeGate();
		}

		const previousElements = new Map<string, HTMLElement>();
		const previousRects = new Map<string, DOMRect>();
		for (const node of Array.from(listEl.children)) {
			if (!(node instanceof HTMLElement)) {
				continue;
			}
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			previousElements.set(id, node);
			previousRects.set(id, node.getBoundingClientRect());
		}
		const previousIds = new Set(previousElements.keys());

		clearChildren(listEl);
		for (const c of ps.combatants) {
			listEl.appendChild(buildCombatantRow(c, active));
		}

		const nextOrderKey = ps.combatants.map((combatant) => combatant.id).join("|");
		const orderChanged = hasRenderedCombatants && previousCombatantOrderKey !== nextOrderKey;
		const nextRects = new Map<string, DOMRect>();
		for (const node of Array.from(listEl.children)) {
			if (!(node instanceof HTMLElement)) {
				continue;
			}
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			nextRects.set(id, node.getBoundingClientRect());
		}

		for (const node of Array.from(listEl.children)) {
			if (!(node instanceof HTMLElement)) {
				continue;
			}
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			const previousRect = previousRects.get(id);
			if (!previousRect) {
				if (hasRenderedCombatants) {
					node.animate(
						[
							{ opacity: 0, transform: "translateY(8px) scale(0.985)" },
							{ opacity: 1, transform: "translateY(0) scale(1)" },
						],
						{ duration: 190, easing: "cubic-bezier(0.2, 0, 0, 1)" },
					);
				}
				continue;
			}
			if (!orderChanged) {
				continue;
			}
			const currentRect = nextRects.get(id);
			if (!currentRect) {
				continue;
			}
			const deltaX = previousRect.left - currentRect.left;
			const deltaY = previousRect.top - currentRect.top;
			if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
				continue;
			}
			node.animate([
				{ transform: `translate(${deltaX}px, ${deltaY}px)` },
				{ transform: "translate(0, 0)" },
			], { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" });
		}

		if (hasRenderedCombatants) {
			for (const id of previousIds) {
				if (nextRects.has(id)) {
					continue;
				}
				const oldNode = previousElements.get(id);
				const oldRect = previousRects.get(id);
				if (!oldNode || !oldRect) {
					continue;
				}
				const ghost = oldNode.cloneNode(true);
				if (!(ghost instanceof HTMLElement)) {
					continue;
				}
				ghost.classList.add("player-ghost");
				ghost.style.setProperty("--ghost-left", `${oldRect.left}px`);
				ghost.style.setProperty("--ghost-top", `${oldRect.top}px`);
				ghost.style.setProperty("--ghost-width", `${oldRect.width}px`);
				ghost.style.setProperty("--ghost-height", `${oldRect.height}px`);
				document.body.appendChild(ghost);
				const animation = ghost.animate([
					{ opacity: 1, transform: "scale(1)" },
					{ opacity: 0, transform: "translateY(-4px) scale(0.985)" },
				], { duration: 170, easing: "ease-out" });
				animation.addEventListener("finish", () => {
					ghost.remove();
				});
			}
		}

		previousCombatantOrderKey = nextOrderKey;
		hasRenderedCombatants = true;

		if (active && lastActiveCombatantId !== active) {
			const activeRow = listEl.querySelector<HTMLElement>(`[data-combatant-id="${active}"]`);
			if (activeRow) {
				scrollRowIntoVisibleArea(activeRow);
			}
		}
		lastActiveCombatantId = active ?? null;
	}

	async function refresh(): Promise<void> {
		if (!playerId) {
			return;
		}
		const response = await api(`/api/player/state?playerId=${encodeURIComponent(playerId)}`);
		const data = asPlayerStateResult(response);
		if (data.ok && data.state) {
			render(data.state);
		}
	}

	function startStream(): void {
		if (!playerId || serverShutDown) {
			return;
		}
		if (stream) {
			stream.close();
		}
		const url = `/api/player/stream?playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`;
		stream = new EventSource(url);
		stream.addEventListener("state_sync", (event: MessageEvent<string>) => {
			const parsed = parseJson(event.data);
			if (isStateSyncPayload(parsed)) {
				render(parsed);
			}
		});
		stream.addEventListener("server_shutdown", (event: MessageEvent<string>) => {
			const parsed = parseJson(event.data);
			if (isRecord(parsed) && typeof parsed.message === "string") {
				handleServerShutdown(parsed.message);
				return;
			}
			handleServerShutdown("Encounter server has shut down.");
		});
		async function handleStreamError(): Promise<void> {
			if (serverShutDown) {
				return;
			}
			if (stream) {
				stream.close();
				stream = null;
			}
			await refresh();
			setTimeout(startStream, 1500);
		}
		stream.onerror = () => {
			void handleStreamError().catch(handleAsyncError);
		};
	}

	async function handleJoinClick(): Promise<void> {
		const name = nameInput.value.trim();
		if (!name.length) {
			joinMsg.textContent = "Name is required.";
			return;
		}
		const response = await api("/api/player/join", "POST", { name, playerId: playerId || undefined });
		const data = asPlayerJoinResult(response);
		if (!data.ok || !data.player || !data.state) {
			joinMsg.textContent = data.error ?? "Join failed.";
			return;
		}
		playerId = data.player.playerId;
		localStorage.setItem("encounter-cast-player-id", playerId);
		const joinAc = readOptionalInputNumber(joinAcInput);
		const joinHp = readOptionalInputNumber(joinHpInput);
		const joinHpMax = readOptionalInputNumber(joinHpMaxInput);
		const joinTempHp = readOptionalInputNumber(joinTempHpInput);
		const hasOptionalJoinStats = joinAc !== null || joinHp !== null || joinHpMax !== null || joinTempHp !== null;
		if (hasOptionalJoinStats) {
			await api("/api/player/update", "POST", {
				playerId,
				ac: joinAc,
				hpCurrent: joinHp,
				hpMax: joinHpMax,
				tempHp: joinTempHp ?? 0,
			});
		}
		setTopView("app");
		if (hasOptionalJoinStats) {
			await refresh();
		} else {
			render(data.state);
		}
		startStream();
	}
	joinBtn.onclick = () => {
		void handleJoinClick().catch((error: unknown) => {
			joinMsg.textContent = "Join failed.";
			handleAsyncError(error);
		});
	};

	showQrBtn.onclick = () => {
		openQrPanel();
	};
	qrBackBtn.onclick = () => {
		openJoinPanel();
	};

	async function handleEndRoundClick(): Promise<void> {
		if (!playerId) {
			return;
		}
		await api("/api/player/end-turn", "POST", { playerId });
	}
	endRoundBtn.onclick = () => {
		void handleEndRoundClick().catch(handleAsyncError);
	};

	initiativeNat1Btn.onclick = () => {
		setInitiativeRollType("nat1");
		initiativeGateInput.value = "1";
	};
	initiativeNormalBtn.onclick = () => {
		setInitiativeRollType("normal");
	};
	initiativeNat20Btn.onclick = () => {
		setInitiativeRollType("nat20");
	};

	async function handleInitiativeSubmitClick(): Promise<void> {
		const initiativeTotal = parseIntOrNull(initiativeGateInput.value);
		if (!playerId || initiativeTotal === null) {
			return;
		}
		await api("/api/player/initiative", "POST", { playerId, initiativeTotal, rollType: initiativeRollType });
		await refresh();
	}
	initiativeGateSubmit.onclick = () => {
		void handleInitiativeSubmitClick().catch(handleAsyncError);
	};

	initiativeGateInput.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key !== "Enter") {
			return;
		}
		event.preventDefault();
		initiativeGateSubmit.click();
	});

	async function handleEditModeClick(): Promise<void> {
		if (sheetMode === "edit") {
			await saveFromSheet();
			return;
		}
		setSheetMode("edit");
	}
	editModeBtn.onclick = () => {
		void handleEditModeClick().catch(handleAsyncError);
	};

	async function handleDamageModeClick(): Promise<void> {
		if (sheetMode === "damage") {
			await applyDamageFromSheet();
			return;
		}
		setSheetMode("damage");
	}
	damageModeBtn.onclick = () => {
		void handleDamageModeClick().catch(handleAsyncError);
	};

	sheetDamage.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key !== "Enter") {
			return;
		}
		event.preventDefault();
		void applyDamageFromSheet().catch(handleAsyncError);
	});

	sheetDamage.addEventListener("blur", () => {
		setTimeout(() => {
			if (sheetMode !== "damage") {
				return;
			}
			const active = document.activeElement;
			if (active === damageModeBtn || active === sheetDamage) {
				return;
			}
			sheetDamage.value = "";
			setSheetMode("none");
		}, 0);
	});

	window.visualViewport?.addEventListener("resize", ensureDamageActionVisible);

	document.addEventListener("pointerdown", (event: PointerEvent) => {
		if (sheetMode !== "edit" || sheetRoot.hidden) {
			return;
		}
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (sheetRoot.contains(target)) {
			return;
		}
		cancelSheetEdit();
	});

	setSheetMode("none");
	availabilityCheckTimer = window.setInterval(() => {
		void checkServerAvailability();
	}, 3000);
	void checkServerAvailability();

	if (playerId) {
		void refresh().then(() => {
			setTopView("app");
			startStream();
		});
	} else {
		setTopView("join");
	}

	window.addEventListener("beforeunload", () => {
		if (!playerId) {
			return;
		}
		stream?.close();
		navigator.sendBeacon(`/api/player/leave?token=${encodeURIComponent(token)}`, JSON.stringify({ playerId }));
	});
}
