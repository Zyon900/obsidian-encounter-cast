/* eslint-disable no-restricted-globals */
import { render } from "preact";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { PlayerFacingState, StateSyncPayload } from "../player-events";
import {
	createHeartIconElement,
	createHexagonIconElement,
	createShieldIconElement,
	createSkullIconElement,
} from "../../utils/icon-factory-tsx";
import { PlayerApiClient } from "./player-api";
import { createPlayerEventStream } from "./player-stream";
import { type PlayerClientBootConfig } from "./player-config";
import { createInitialUiState, playerUiReducer } from "./player-state";
import { getSelfCombatant, hpClass, hpStateClass, parseIntOrNull, sentenceCaseLabel } from "./player-selectors";

function applyThemeCssVars(theme: PlayerClientBootConfig["theme"]): void {
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

function createEmptyState(): StateSyncPayload {
	return {
		session: null,
		playerState: {
			encounterRunning: false,
			round: 1,
			activeCombatantId: null,
			combatants: [],
			players: [],
			theme: null,
			sessionId: null,
		},
	};
}

function ensureDamageActionVisible(button: HTMLButtonElement | null): void {
	if (!button) {
		return;
	}
	const viewportBottom = window.visualViewport
		? window.visualViewport.offsetTop + window.visualViewport.height
		: window.innerHeight;
	const buttonRect = button.getBoundingClientRect();
	// iOS/Android often add an accessory bar above the keyboard; keep action buttons above it.
	const keyboardAccessoryGuard = window.visualViewport && window.matchMedia("(pointer: coarse)").matches ? 62 : 0;
	const safeBottom = viewportBottom - (10 + keyboardAccessoryGuard);
	if (buttonRect.bottom > safeBottom) {
		window.scrollBy({ top: buttonRect.bottom - safeBottom, behavior: "smooth" });
	}
}

function createInviteLink(token: string): string {
	const inviteUrl = new URL(window.location.href);
	inviteUrl.searchParams.set("token", token);
	inviteUrl.searchParams.delete("playerId");
	return inviteUrl.toString();
}

function useListAnimations(
	listRef: { current: HTMLDivElement | null },
	combatants: PlayerFacingState["combatants"],
	activeCombatantId: string | null,
	sheetVisible: boolean,
): void {
	const previousRectsRef = useRef(new Map<string, DOMRect>());
	const previousOrderKeyRef = useRef("");
	const hasRenderedRef = useRef(false);
	const previousActiveRef = useRef<string | null>(null);

	useLayoutEffect(() => {
		const list = listRef.current;
		if (!list) {
			return;
		}
		// FLIP-style list animation snapshot: measure previous layout before rebuilding rows.
		const previousRects = previousRectsRef.current;
		const nextRects = new Map<string, DOMRect>();
		const nodes = Array.from(list.querySelectorAll<HTMLElement>("[data-combatant-id]"));
		const orderKey = combatants.map((combatant) => combatant.id).join("|");
		const orderChanged = hasRenderedRef.current && previousOrderKeyRef.current !== orderKey;

		for (const node of nodes) {
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			nextRects.set(id, node.getBoundingClientRect());
		}

		for (const node of nodes) {
			const id = node.dataset.combatantId;
			if (!id) {
				continue;
			}
			const previousRect = previousRects.get(id);
			if (!previousRect) {
				if (hasRenderedRef.current) {
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

		previousRectsRef.current = nextRects;
		previousOrderKeyRef.current = orderKey;
		hasRenderedRef.current = true;

		if (activeCombatantId && previousActiveRef.current !== activeCombatantId) {
			const activeRow = list.querySelector<HTMLElement>(`[data-combatant-id="${activeCombatantId}"]`);
			if (activeRow) {
				const rowRect = activeRow.getBoundingClientRect();
				const sheetInset = sheetVisible ? 260 : 0;
				const topLimit = 8;
				const bottomLimit = window.innerHeight - sheetInset - 8;
				if (rowRect.bottom > bottomLimit) {
					window.scrollBy({ top: rowRect.bottom - bottomLimit, behavior: "smooth" });
				} else if (rowRect.top < topLimit) {
					window.scrollBy({ top: rowRect.top - topLimit, behavior: "smooth" });
				}
			}
		}
		previousActiveRef.current = activeCombatantId;
	}, [combatants, activeCombatantId, listRef, sheetVisible]);
}

function DeathSaveIndicator({ successes, failures, className }: { successes: number; failures: number; className: string }) {
	const clampedSuccesses = Math.max(0, Math.min(3, Math.trunc(successes)));
	const clampedFailures = Math.max(0, Math.min(3, Math.trunc(failures)));
	const createDiamond = (filled: boolean) => (
		<span className={`death-save-diamond${filled ? " is-filled" : ""}`}>{filled ? "◆" : "◇"}</span>
	);
	return (
		<div className={`death-save-indicator ${className}`.trim()}>
			<div className="death-save-row is-failure">
				<span className="death-save-icon">{createSkullIconElement({ ariaHidden: true })}</span>
				{createDiamond(clampedFailures >= 1)}
				{createDiamond(clampedFailures >= 2)}
				{createDiamond(clampedFailures >= 3)}
			</div>
			<div className="death-save-row is-success">
				<span className="death-save-icon">{createHeartIconElement({ ariaHidden: true })}</span>
				{createDiamond(clampedSuccesses >= 1)}
				{createDiamond(clampedSuccesses >= 2)}
				{createDiamond(clampedSuccesses >= 3)}
			</div>
		</div>
	);
}

function PlayerClientApp() {
	const config = window.__ENCOUNTER_CAST_PLAYER_CONFIG__ ?? { supportUrl: null, theme: null };
	const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
	const [ui, dispatch] = useReducer(playerUiReducer, createInitialUiState(localStorage.getItem("encounter-cast-player-id") ?? ""));
	const [joinName, setJoinName] = useState("");
	const [joinAc, setJoinAc] = useState("");
	const [joinHp, setJoinHp] = useState("");
	const [joinHpMax, setJoinHpMax] = useState("");
	const [joinTempHp, setJoinTempHp] = useState("");
	const [sheetAc, setSheetAc] = useState("");
	const [sheetHp, setSheetHp] = useState("");
	const [sheetHpMax, setSheetHpMax] = useState("");
	const [sheetTempHp, setSheetTempHp] = useState("");
	const [sheetDamage, setSheetDamage] = useState("");
	const [initiativeInput, setInitiativeInput] = useState("");
	const [reconnectNonce, setReconnectNonce] = useState(0);
	const sheetRootRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const damageModeBtnRef = useRef<HTMLButtonElement | null>(null);
	const damageInputRef = useRef<HTMLInputElement | null>(null);
	const initiativeInputRef = useRef<HTMLInputElement | null>(null);
	const api = useMemo(() => new PlayerApiClient(token), [token]);

	const stateSync = ui.stateSync ?? createEmptyState();
	const self = getSelfCombatant(ui.stateSync);
	const isYourTurn = Boolean(self && stateSync.playerState.encounterRunning && self.id === stateSync.playerState.activeCombatantId);
	const isDowned = Boolean(self && self.deathState === "down");
	const needsInitiative = Boolean(self && stateSync.playerState.encounterRunning && self.initiative === null);

	useListAnimations(listRef, stateSync.playerState.combatants, stateSync.playerState.activeCombatantId, ui.topView === "app");

	useEffect(() => {
		applyThemeCssVars(config.theme);
	}, [config.theme]);

	useEffect(() => {
		if (!self) {
			setSheetAc("");
			setSheetHp("");
			setSheetHpMax("");
			setSheetTempHp("");
			dispatch({ type: "SET_DEATH_DRAFT", failures: 0, successes: 0 });
			return;
		}
		setSheetAc(self.ac === null ? "" : String(self.ac));
		setSheetHp(self.hpCurrent === null ? "" : String(self.hpCurrent));
		setSheetHpMax(self.hpMax === null ? "" : String(self.hpMax));
		setSheetTempHp(String(self.tempHp ?? 0));
		dispatch({
			type: "SET_DEATH_DRAFT",
			failures: Math.max(0, Math.min(3, Math.trunc(self.deathSaveFailures ?? 0))),
			successes: Math.max(0, Math.min(3, Math.trunc(self.deathSaveSuccesses ?? 0))),
		});
	}, [self?.id, self?.ac, self?.hpCurrent, self?.hpMax, self?.tempHp, self?.deathSaveFailures, self?.deathSaveSuccesses]);

	useEffect(() => {
		if (!isDowned && ui.sheetMode === "death") {
			dispatch({ type: "SET_SHEET_MODE", value: "none" });
		}
	}, [isDowned, ui.sheetMode]);

	useEffect(() => {
		if (ui.sheetMode !== "damage") {
			return;
		}
		const timer = window.setTimeout(() => {
			damageInputRef.current?.focus();
			damageInputRef.current?.select();
			ensureDamageActionVisible(damageModeBtnRef.current);
		}, 20);
		return () => clearTimeout(timer);
	}, [ui.sheetMode]);

	useEffect(() => {
		if (!needsInitiative) {
			setInitiativeInput("");
			return;
		}
		const timer = window.setTimeout(() => {
			initiativeInputRef.current?.focus();
			initiativeInputRef.current?.select();
		}, 30);
		return () => clearTimeout(timer);
	}, [needsInitiative]);

	useEffect(() => {
		if (ui.sheetMode !== "edit") {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}
			if (sheetRootRef.current?.contains(target)) {
				return;
			}
			dispatch({ type: "SET_SHEET_MODE", value: "none" });
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [ui.sheetMode]);

	const refreshState = useCallback(async () => {
		if (!ui.playerId) {
			return;
		}
		const result = await api.refreshState(ui.playerId);
		if (result.ok && result.state) {
			dispatch({ type: "SET_STATE_SYNC", value: result.state });
		}
	}, [api, ui.playerId]);

	useEffect(() => {
		if (!ui.playerId || ui.topView !== "app" || ui.serverShutDown) {
			return;
		}
		let closed = false;
		const stream = createPlayerEventStream(token, ui.playerId, {
			onStateSync: (nextState) => {
				dispatch({ type: "SET_STATE_SYNC", value: nextState });
			},
			onServerShutdown: (message) => {
				dispatch({ type: "SERVER_SHUTDOWN", value: message || "Encounter server has shut down." });
			},
			onPlayerKicked: (message) => {
				localStorage.removeItem("encounter-cast-player-id");
				dispatch({ type: "PLAYER_KICKED", value: message || "You were removed from this encounter." });
			},
			onDisconnected: () => {
				if (closed) {
					return;
				}
				stream.close();
				void refreshState().finally(() => {
					window.setTimeout(() => setReconnectNonce((value) => value + 1), 1500);
				});
			},
		});
		return () => {
			closed = true;
			stream.close();
		};
	}, [ui.playerId, ui.topView, ui.serverShutDown, token, refreshState, reconnectNonce]);

	useEffect(() => {
		if (ui.playerId || ui.serverShutDown || ui.topView === "kicked") {
			return;
		}
		const check = async () => {
			try {
				const response = await fetch("/health", { cache: "no-store" });
				if (!response.ok) {
					throw new Error("Health endpoint unavailable.");
				}
			} catch {
				dispatch({ type: "SERVER_SHUTDOWN", value: "Encounter server has shut down." });
			}
		};
		void check();
		const timer = window.setInterval(() => void check(), 3000);
		return () => clearInterval(timer);
	}, [ui.playerId, ui.serverShutDown, ui.topView]);

	useEffect(() => {
		if (!ui.playerId) {
			return;
		}
		void refreshState();
	}, [ui.playerId, refreshState]);

	useEffect(() => {
		return () => {
			if (!ui.playerId) {
				return;
			}
			navigator.sendBeacon(`/api/player/leave?token=${encodeURIComponent(token)}`, JSON.stringify({ playerId: ui.playerId }));
		};
	}, [token, ui.playerId]);

	const onJoin = async () => {
		const name = joinName.trim();
		if (!name.length) {
			dispatch({ type: "SET_JOIN_MESSAGE", value: "Name is required." });
			return;
		}
		const joined = await api.join({ name, playerId: ui.playerId || undefined });
		if (!joined.ok || !joined.player || !joined.state) {
			dispatch({ type: "SET_JOIN_MESSAGE", value: joined.error ?? "Join failed." });
			return;
		}
		const nextPlayerId = joined.player.playerId;
		localStorage.setItem("encounter-cast-player-id", nextPlayerId);
		dispatch({ type: "SET_PLAYER_ID", value: nextPlayerId });
		dispatch({ type: "SET_TOP_VIEW", value: "app" });
		dispatch({ type: "SET_STATE_SYNC", value: joined.state });
		dispatch({ type: "SET_JOIN_MESSAGE", value: "" });
		const parsedAc = parseIntOrNull(joinAc);
		const parsedHp = parseIntOrNull(joinHp);
		const parsedHpMax = parseIntOrNull(joinHpMax);
		const parsedTemp = parseIntOrNull(joinTempHp);
		if (parsedAc !== null || parsedHp !== null || parsedHpMax !== null || parsedTemp !== null) {
			await api.updatePlayer({
				playerId: nextPlayerId,
				ac: parsedAc,
				hpCurrent: parsedHp,
				hpMax: parsedHpMax,
				tempHp: parsedTemp ?? 0,
			});
			await refreshState();
		}
	};

	const onSaveStats = async () => {
		if (!ui.playerId) {
			return;
		}
		await api.updatePlayer({
			playerId: ui.playerId,
			ac: parseIntOrNull(sheetAc),
			hpCurrent: parseIntOrNull(sheetHp),
			hpMax: parseIntOrNull(sheetHpMax),
			tempHp: parseIntOrNull(sheetTempHp) ?? 0,
		});
		await refreshState();
		dispatch({ type: "SET_SHEET_MODE", value: "none" });
	};

	const onApplyDamage = async () => {
		if (!ui.playerId || !self) {
			return;
		}
		const rawDamage = parseIntOrNull(sheetDamage);
		if (rawDamage === null) {
			dispatch({ type: "SET_SHEET_MODE", value: "none" });
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
			hpCurrent = hpMax === null ? hpCurrent + heal : Math.min(hpMax, hpCurrent + heal);
		}
		await api.updatePlayer({ playerId: ui.playerId, hpCurrent, tempHp });
		await refreshState();
		setSheetDamage("");
		dispatch({ type: "SET_SHEET_MODE", value: "none" });
	};

	const onDeathSaveClick = async (track: "failures" | "successes", value: number) => {
		if (!ui.playerId || !self || self.deathState !== "down") {
			return;
		}
		const nextFailures = track === "failures"
			? (value === 1 && ui.deathDraftFailures === 1 ? 0 : value)
			: ui.deathDraftFailures;
		const nextSuccesses = track === "successes"
			? (value === 1 && ui.deathDraftSuccesses === 1 ? 0 : value)
			: ui.deathDraftSuccesses;
		dispatch({ type: "SET_DEATH_DRAFT", failures: nextFailures, successes: nextSuccesses });
		await api.updateDeathSaves({
			playerId: ui.playerId,
			failures: nextFailures,
			successes: nextSuccesses,
		});
		await refreshState();
	};

	if (ui.topView === "shutdown") {
		return (
			<div className="shutdown-screen">
				<div className="shutdown-card">
					<h2>Thanks for playing!</h2>
					<p>
						If you enjoyed this plugin, consider supporting the author:
						{config.supportUrl ? (
							<>
								{" "}
								<a href={config.supportUrl} target="_blank" rel="noopener noreferrer">Buy him a coffee!</a>
							</>
						) : (
							" Buy him a coffee!"
						)}
					</p>
				</div>
			</div>
		);
	}

	if (ui.topView === "kicked") {
		return (
			<div className="shutdown-screen">
				<div className="shutdown-card">
					<h2>Removed from encounter</h2>
					<p>{ui.kickedMessage || "You were removed from this encounter."}</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="wrap">
				{ui.topView === "join" ? (
					<div className="panel" id="joinPanel">
						<h3>Join encounter</h3>
						<div className="sheet-grid">
							<label>Name<input id="nameInput" placeholder="Your name" value={joinName} onInput={(event) => setJoinName(event.currentTarget.value)} /></label>
							<label>AC<input id="joinAcInput" type="number" placeholder="Optional" value={joinAc} onInput={(event) => setJoinAc(event.currentTarget.value)} /></label>
							<label>HP<input id="joinHpInput" type="number" placeholder="Optional" value={joinHp} onInput={(event) => setJoinHp(event.currentTarget.value)} /></label>
							<label>Max HP<input id="joinHpMaxInput" type="number" placeholder="Optional" value={joinHpMax} onInput={(event) => setJoinHpMax(event.currentTarget.value)} /></label>
							<label>Temp HP<input id="joinTempHpInput" type="number" placeholder="Optional" value={joinTempHp} onInput={(event) => setJoinTempHp(event.currentTarget.value)} /></label>
						</div>
						<div className="row"><button id="joinBtn" type="button" onClick={() => void onJoin()}>Join</button></div>
						<div className="row"><button id="showQrBtn" className="secondary-btn" type="button" onClick={() => dispatch({ type: "SET_TOP_VIEW", value: "qr" })}>Show QR-Code</button></div>
						<div id="joinMsg">{ui.joinMessage}</div>
					</div>
				) : null}
				{ui.topView === "qr" ? (
					<div className="panel qr-panel" id="qrPanel">
						<h3>Join via QR-Code</h3>
						<div className="qr-image-wrap">
							<div className="qr-image-frame">
								<img id="qrImage" alt="Join encounter QR code" src={`/api/invite-qr?token=${encodeURIComponent(token)}&v=${Date.now()}`} />
							</div>
						</div>
						<a id="qrLink" className="qr-link" href={createInviteLink(token)} target="_blank" rel="noopener noreferrer">{createInviteLink(token)}</a>
						<div className="row"><button id="qrBackBtn" className="secondary-btn" type="button" onClick={() => dispatch({ type: "SET_TOP_VIEW", value: "join" })}>Back</button></div>
					</div>
				) : null}
				{ui.topView === "app" ? (
					<div id="appPanel" className="app-shell">
						<div className="app-header row"><strong id="title">{`Round ${stateSync.playerState.round}`}</strong></div>
						<div id="status">{stateSync.playerState.encounterRunning ? "Combat running" : "Waiting for combat start"}</div>
						<div id="list" ref={listRef}>
							{stateSync.playerState.combatants.map((combatant) => (
								<div
									key={combatant.id}
									className={`combatant${combatant.id === stateSync.playerState.activeCombatantId ? " active" : ""}${combatant.isSelf ? " is-self" : ""}${combatant.isSelf && combatant.id === stateSync.playerState.activeCombatantId ? " is-your-turn" : ""}`}
									data-combatant-id={combatant.id}
								>
									<span className={`initiative${combatant.initiativeCriticalFailure ? " is-crit-fail" : combatant.initiativeRoll === 20 ? " is-crit-success" : ""}`}>
										{createHexagonIconElement({ ariaHidden: true })}
										<span>{combatant.initiative ?? "-"}</span>
									</span>
									<div className="name-block">
										<div className="name">{combatant.name}</div>
										<div className={hpClass(combatant.hpLabel)}>{sentenceCaseLabel(combatant.hpLabel)}</div>
									</div>
									{combatant.isPlayer && combatant.deathState === "down" ? (
										<DeathSaveIndicator
											successes={combatant.deathSaveSuccesses ?? 0}
											failures={combatant.deathSaveFailures ?? 0}
											className="list"
										/>
									) : null}
									<div className="tail">
										<span className={`shield${combatant.isSelf || combatant.isPlayer ? "" : " placeholder"}`}>
											{createShieldIconElement({ ariaHidden: true })}
											<span>{combatant.ac ?? "-"}</span>
										</span>
										{!combatant.isPlayer ? <span className="subtle">Monster</span> : null}
									</div>
								</div>
							))}
						</div>
					</div>
				) : null}
			</div>

			<div id="initiativeGate" className={`initiative-gate${needsInitiative ? " open" : ""}`} aria-live="polite">
				<div className="initiative-gate-card">
					<h2>Roll Initiative!</h2>
					<input
						id="initiativeGateInput"
						ref={initiativeInputRef}
						type="number"
						inputMode="numeric"
						placeholder="Initiative total"
						value={initiativeInput}
						onInput={(event) => setInitiativeInput(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								const total = parseIntOrNull(initiativeInput);
								if (ui.playerId && total !== null) {
									void api.submitInitiative({ playerId: ui.playerId, initiativeTotal: total, rollType: ui.initiativeRollType }).then(refreshState);
								}
							}
						}}
					/>
					<div className="initiative-roll-toggle">
						<button
							id="initiativeNat1Btn"
							className={`initiative-roll-btn hex-only${ui.initiativeRollType === "nat1" ? " is-active" : ""}`}
							type="button"
							aria-label="Natural 1"
							onClick={() => {
								dispatch({ type: "SET_INITIATIVE_ROLL_TYPE", value: "nat1" });
								setInitiativeInput("1");
							}}
						>
							<span className="initiative-mini-hex hex red">{createHexagonIconElement({ ariaHidden: true })}<span>1</span></span>
						</button>
						<button id="initiativeNormalBtn" className={`initiative-roll-btn${ui.initiativeRollType === "normal" ? " is-active" : ""}`} type="button" onClick={() => dispatch({ type: "SET_INITIATIVE_ROLL_TYPE", value: "normal" })}><span>Normal</span></button>
						<button id="initiativeNat20Btn" className={`initiative-roll-btn hex-only${ui.initiativeRollType === "nat20" ? " is-active" : ""}`} type="button" aria-label="Natural 20" onClick={() => dispatch({ type: "SET_INITIATIVE_ROLL_TYPE", value: "nat20" })}>
							<span className="initiative-mini-hex hex green">{createHexagonIconElement({ ariaHidden: true })}<span>20</span></span>
						</button>
					</div>
					<button
						id="initiativeGateSubmit"
						type="button"
						onClick={() => {
							const total = parseIntOrNull(initiativeInput);
							if (!ui.playerId || total === null) {
								return;
							}
							void api.submitInitiative({ playerId: ui.playerId, initiativeTotal: total, rollType: ui.initiativeRollType }).then(refreshState);
						}}
					>
						Submit initiative
					</button>
				</div>
			</div>

			{ui.topView === "app" ? (
				<div id="sheetRoot" className="sheet" ref={sheetRootRef}>
					<div className="sheet-handle" aria-hidden="true"></div>
					<div id="editPanel" className={`sheet-panel${ui.sheetMode === "edit" ? " open" : ""}`}>
						<div className="sheet-grid">
							<label>AC<input id="sheetAc" type="number" placeholder="AC" value={sheetAc} onInput={(event) => setSheetAc(event.currentTarget.value)} /></label>
							<label>HP<input id="sheetHp" type="number" placeholder="HP" value={sheetHp} onInput={(event) => setSheetHp(event.currentTarget.value)} /></label>
							<label>Max HP<input id="sheetHpMax" type="number" placeholder="Max HP" value={sheetHpMax} onInput={(event) => setSheetHpMax(event.currentTarget.value)} /></label>
							<label>Temp HP<input id="sheetTempHp" type="number" placeholder="Temp HP" value={sheetTempHp} onInput={(event) => setSheetTempHp(event.currentTarget.value)} /></label>
						</div>
					</div>
					<div className="sheet-header">
						<div id="sheetSummary" className={`sheet-summary${ui.sheetMode === "edit" ? " is-hidden" : ""}`}>
							<div className="sheet-player-summary">
								<div className="sheet-player-main">
									<span className={`initiative${self?.initiativeCriticalFailure ? " is-crit-fail" : self?.initiativeRoll === 20 ? " is-crit-success" : ""}`}>
										{createHexagonIconElement({ ariaHidden: true })}
										<span>{self?.initiative ?? "-"}</span>
									</span>
									<span className="sheet-player-name-block">
										<span className="sheet-player-name">{self?.name ?? "-"}</span>
										<span className={hpStateClass(String(self?.hpLabel ?? "healthy"))}>{sentenceCaseLabel(String(self?.hpLabel ?? "healthy"))}</span>
									</span>
								</div>
								<span className="sheet-player-vitals">
									<span className="sheet-player-heart">{createHeartIconElement({ ariaHidden: true })}</span>
									<span className="sheet-summary-hp">{`${self?.hpCurrent ?? "-"}/${self?.hpMax ?? "-"}`}</span>
									<span className="sheet-summary-temp">{`+${self?.tempHp ?? 0}`}</span>
								</span>
								<span className="sheet-summary-shield">{createShieldIconElement({ ariaHidden: true })}<span>{self?.ac ?? "-"}</span></span>
							</div>
						</div>
					</div>
					<div id="damagePanel" className={`sheet-panel${ui.sheetMode === "damage" ? " open" : ""}`}>
						<div className="sheet-grid">
							<label>Damage / heal<input id="sheetDamage" ref={damageInputRef} type="number" placeholder="e.g. 7 damage or -7 heal" value={sheetDamage} onInput={(event) => setSheetDamage(event.currentTarget.value)} /></label>
						</div>
					</div>
					<div id="deathSavePanel" className={`sheet-panel death-save-panel${ui.sheetMode === "death" ? " open" : ""}`}>
						<div className="death-save-editor">
							<div className="death-save-editor-row">
								<span className="death-save-editor-icon is-failure" aria-hidden="true">{createSkullIconElement({ ariaHidden: true })}</span>
								<div className="death-save-editor-diamonds">
									{([1, 2, 3] as const).map((value) => (
										<button key={`f-${value}`} type="button" className={`death-save-diamond-btn${value <= ui.deathDraftFailures ? " is-filled" : ""}`} onClick={() => void onDeathSaveClick("failures", value)}>{value <= ui.deathDraftFailures ? "◆" : "◇"}</button>
									))}
								</div>
							</div>
							<div className="death-save-editor-row">
								<span className="death-save-editor-icon is-success" aria-hidden="true">{createHeartIconElement({ ariaHidden: true })}</span>
								<div className="death-save-editor-diamonds">
									{([1, 2, 3] as const).map((value) => (
										<button key={`s-${value}`} type="button" className={`death-save-diamond-btn${value <= ui.deathDraftSuccesses ? " is-filled" : ""}`} onClick={() => void onDeathSaveClick("successes", value)}>{value <= ui.deathDraftSuccesses ? "◆" : "◇"}</button>
									))}
								</div>
							</div>
							<button id="deathSaveCloseBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-static" onClick={() => dispatch({ type: "SET_SHEET_MODE", value: "none" })}>Close</button>
							<div id="confirmDeathCta" className={`death-confirm-cta${ui.deathDraftFailures >= 3 ? " is-visible" : ""}`}>
								<button id="confirmDeathBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent" onClick={() => void (ui.playerId ? api.updateDeathSaves({ playerId: ui.playerId, confirm: "dead" }).then(refreshState).then(() => dispatch({ type: "SET_SHEET_MODE", value: "none" })) : Promise.resolve())}>Confirm death</button>
							</div>
							<div id="confirmSavedCta" className={`death-confirm-cta${ui.deathDraftSuccesses >= 3 ? " is-visible" : ""}`}>
								<button id="confirmSavedBtn" type="button" className="secondary-btn death-confirm-btn death-confirm-btn-accent" onClick={() => void (ui.playerId ? api.updateDeathSaves({ playerId: ui.playerId, confirm: "saved" }).then(refreshState).then(() => dispatch({ type: "SET_SHEET_MODE", value: "none" })) : Promise.resolve())}>Confirm stabilized</button>
							</div>
						</div>
					</div>
					<div id="sheetActions" className={`sheet-actions${ui.sheetMode === "death" ? " is-hidden" : ""}`}>
						<button id="editModeBtn" type="button" className={ui.sheetMode === "edit" ? "is-active" : ""} onClick={() => void (ui.sheetMode === "edit" ? onSaveStats() : dispatch({ type: "SET_SHEET_MODE", value: "edit" }))}>{ui.sheetMode === "edit" ? "Save stats" : "Edit stats"}</button>
						<button
							id="damageModeBtn"
							ref={damageModeBtnRef}
							type="button"
							className={ui.sheetMode === "damage" ? "is-active" : ""}
							onClick={() => {
								if (ui.sheetMode === "damage") {
									void onApplyDamage();
									return;
								}
								dispatch({ type: "SET_SHEET_MODE", value: "damage" });
							}}
						>
							{ui.sheetMode === "damage" ? "Apply Damage " : "Damage "}
							<span className="sep">|</span>
							{" Heal"}
						</button>
					</div>
					<div id="sheetDeathCta" className={`sheet-turn-cta${isDowned && ui.sheetMode !== "death" && ui.sheetMode !== "edit" && ui.sheetMode !== "damage" ? " is-visible" : " is-hidden"}`}>
						<button id="deathSaveModeBtn" type="button" onClick={() => dispatch({ type: "SET_SHEET_MODE", value: "death" })}>Death saves</button>
					</div>
					<div id="sheetTurnCta" className={`sheet-turn-cta${isYourTurn ? " is-visible" : ""}`}>
						<button id="endRoundBtn" type="button" disabled={!isYourTurn} onClick={() => void (ui.playerId ? api.endTurn({ playerId: ui.playerId }).then(refreshState) : Promise.resolve())}>End round</button>
					</div>
				</div>
			) : null}
		</>
	);
}

const root = document.getElementById("encounter-cast-player-root");
if (root) {
	render(<PlayerClientApp />, root);
}
