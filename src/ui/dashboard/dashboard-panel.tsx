import { Menu, setIcon } from "obsidian";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Combatant } from "../../encounter/combat-session";
import { MonsterHoverPreviewTrigger } from "../monsters/monster-hover-preview-trigger";
import type { DashboardActions, DashboardViewModel } from "./types";

interface DashboardPanelProps {
	model: DashboardViewModel;
	actions: DashboardActions;
}

// Keeps row/tail element maps in sync with mount/unmount cycles.
function setMappedRef<T extends Element>(
	map: Map<string, T>,
	id: string,
	element: T | null,
): void {
	if (element) {
		map.set(id, element);
		return;
	}
	map.delete(id);
}

// Prevents unnecessary state updates when wrapped-row state did not change.
function areWrappedMapsEqual(
	current: Record<string, boolean>,
	next: Record<string, boolean>,
): boolean {
	const currentKeys = Object.keys(current);
	const nextKeys = Object.keys(next);
	if (currentKeys.length !== nextKeys.length) {
		return false;
	}
	for (const key of nextKeys) {
		if (current[key] !== next[key]) {
			return false;
		}
	}
	return true;
}
// Main dashboard view: renders combatants, encounter controls, and QR modal.
export function DashboardPanel({ model, actions }: DashboardPanelProps) {
	const [draggingCombatantId, setDraggingCombatantId] = useState<string | null>(null);
	const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
	const [selectedCombatantIds, setSelectedCombatantIds] = useState<string[]>([]);
	const [wrappedRows, setWrappedRows] = useState<Record<string, boolean>>({});
	const [layoutTick, setLayoutTick] = useState(0);
	const dashboardRootRef = useRef<HTMLDivElement | null>(null);
	const combatantRowRefs = useRef(new Map<string, HTMLDivElement>());
	const combatantTailRefs = useRef(new Map<string, HTMLDivElement>());
	const previousCombatantRects = useRef(new Map<string, DOMRect>());
	const suppressAnimationRef = useRef(true);
	const previousOrderKeyRef = useRef("");
	const previousActiveCombatantIdRef = useRef<string | null>(null);
	const primaryInvite = model.inviteUrls[0] ?? null;
	const session = model.session;
	const canControlTurns = Boolean(session && model.encounterRunning && session.combatants.length > 0);
	const hasEncounter = Boolean(session);
	const combatantLookup = useRef(new Map<string, Combatant>());

	useEffect(() => {
		const lookup = new Map<string, Combatant>();
		for (const combatant of session?.combatants ?? []) {
			lookup.set(combatant.id, combatant);
		}
		combatantLookup.current = lookup;
		setSelectedCombatantIds((current) => current.filter((combatantId) => lookup.has(combatantId)));
	}, [session]);

	const isPlayerCombatantId = (combatantId: string): boolean => {
		return combatantLookup.current.get(combatantId)?.isPlayer === true;
	};

	const getContextSelection = (combatant: Combatant): string[] => {
		const isSelected = selectedCombatantIds.includes(combatant.id);
		if (!isSelected) {
			return [combatant.id];
		}

		const targetIsPlayer = combatant.isPlayer === true;
		return selectedCombatantIds.filter((combatantId) => isPlayerCombatantId(combatantId) === targetIsPlayer);
	};

	const selectCombatant = (combatant: Combatant, append: boolean): void => {
		const combatantId = combatant.id;
		if (!append) {
			setSelectedCombatantIds([combatantId]);
			return;
		}

		setSelectedCombatantIds((current) => {
			const targetIsPlayer = combatant.isPlayer === true;
			const sameTypeSelection = current.filter((candidateId) => isPlayerCombatantId(candidateId) === targetIsPlayer);
			if (sameTypeSelection.includes(combatantId)) {
				return sameTypeSelection.filter((candidateId) => candidateId !== combatantId);
			}
			return sameTypeSelection.concat(combatantId);
		});
	};

	const openCombatantContextMenu = (event: MouseEvent, combatant: Combatant): void => {
		event.preventDefault();
		const rowWasSelected = selectedCombatantIds.includes(combatant.id);
		const selection = getContextSelection(combatant);
		const selectionSet = new Set(selection);
		const orderedSelection =
			session?.combatants.filter((candidate) => selectionSet.has(candidate.id)).map((candidate) => candidate.id) ?? selection;
		if (!rowWasSelected) {
			setSelectedCombatantIds([combatant.id]);
		}
		const menu = new Menu();

		if (combatant.isPlayer === true) {
			if (orderedSelection.length === 1) {
				menu.addItem((item) =>
					item.setTitle("Set active").setIcon("play").onClick(() => {
						actions.onActivateCombatant(combatant.id);
					}),
				);
			}
			menu.addItem((item) =>
				item
					.setTitle(orderedSelection.length > 1 ? `Kick (${orderedSelection.length})` : "Kick")
					.setIcon("user-x")
					.setDisabled(!model.serverRunning)
					.onClick(() => {
						actions.onKickPlayers(orderedSelection);
					}),
			);
			menu.showAtMouseEvent(event);
			return;
		}

		const firstMonsterId = orderedSelection[0] ?? combatant.id;
		if (orderedSelection.length === 1) {
			menu.addItem((item) =>
				item.setTitle("Set active").setIcon("play").onClick(() => {
					actions.onActivateCombatant(firstMonsterId);
				}),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle(orderedSelection.length > 1 ? `Damage / heal (${orderedSelection.length})` : "Damage / heal")
				.setIcon("sword")
				.onClick(() => {
					actions.onDamageHealCombatants(orderedSelection);
				}),
		);
		if (orderedSelection.length === 1) {
			menu.addItem((item) =>
				item.setTitle("Rename").setIcon("pencil").onClick(() => {
					actions.onRenameCombatant(firstMonsterId);
				}),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle(orderedSelection.length > 1 ? `Duplicate (${orderedSelection.length})` : "Duplicate")
				.setIcon("copy")
				.onClick(() => {
					actions.onDuplicateCombatants(orderedSelection);
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle(orderedSelection.length > 1 ? `Delete (${orderedSelection.length})` : "Delete")
				.setIcon("trash")
				.onClick(() => {
					actions.onDeleteCombatants(orderedSelection);
				}),
		);
		menu.showAtMouseEvent(event);
	};

	const beginCombatantDrag = (combatantId: string): void => {
		setDraggingCombatantId(combatantId);
	};

	const endCombatantDrag = (): void => {
		setDraggingCombatantId(null);
		setDragTargetIndex(null);
	};

	const dropCombatantAtIndex = (targetIndex: number): void => {
		if (!session || draggingCombatantId === null) {
			endCombatantDrag();
			return;
		}

		actions.onMoveCombatantToIndex(draggingCombatantId, targetIndex);
		endCombatantDrag();
	};

	const bindCombatantRowRef = (combatantId: string, element: HTMLDivElement | null): void => {
		setMappedRef(combatantRowRefs.current, combatantId, element);
	};

	const bindCombatantTailRef = (combatantId: string, element: HTMLDivElement | null): void => {
		setMappedRef(combatantTailRefs.current, combatantId, element);
	};

	// Wrapping and FLIP animation depend on real DOM measurements.
	// Triggering a lightweight measurement tick on viewport resize keeps that state accurate.
	useEffect(() => {
		let frame = 0;
		const onResize = () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			frame = requestAnimationFrame(() => {
				suppressAnimationRef.current = true;
				setLayoutTick((value) => value + 1);
			});
		};

		window.addEventListener("resize", onResize);
		return () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			window.removeEventListener("resize", onResize);
		};
	}, []);

	// Obsidian pane resizes do not always emit `window.resize`.
	// Observing the dashboard root directly keeps wrap detection correct in split views.
	useEffect(() => {
		const root = dashboardRootRef.current;
		if (!root || typeof ResizeObserver === "undefined") {
			return;
		}

		let frame = 0;
		let hasMeasured = false;
		const scheduleLayoutRefresh = () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			frame = requestAnimationFrame(() => {
				suppressAnimationRef.current = true;
				setLayoutTick((value) => value + 1);
			});
		};

		const observer = new ResizeObserver(() => {
			if (!hasMeasured) {
				hasMeasured = true;
				return;
			}
			scheduleLayoutRefresh();
		});
		observer.observe(root);
		return () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			observer.disconnect();
		};
	}, []);

	const combatantOrderKey = session?.combatants.map((combatant) => combatant.id).join("|") ?? "";
	const activeCombatantId = session?.combatants[session.activeIndex]?.id ?? null;
	// This effect drives row layout behavior in three steps:
	// 1) Read current row rects and wrapped-state from the DOM.
	// 2) Update wrapped classes only when the state actually changed.
	// 3) Animate only real order changes via FLIP; pure resize/wrap recalculations skip animation.
	useLayoutEffect(() => {
		if (!session) {
			previousCombatantRects.current.clear();
			suppressAnimationRef.current = true;
			previousOrderKeyRef.current = "";
			setWrappedRows({});
			return;
		}

		const nextRects = new Map<string, DOMRect>();
		for (const combatant of session.combatants) {
			const element = combatantRowRefs.current.get(combatant.id);
			if (!element) {
				continue;
			}
			nextRects.set(combatant.id, element.getBoundingClientRect());
		}

		const nextWrapped: Record<string, boolean> = {};
		for (const combatant of session.combatants) {
			const rowEl = combatantRowRefs.current.get(combatant.id);
			const tailEl = combatantTailRefs.current.get(combatant.id);
			if (!rowEl || !tailEl) {
				continue;
			}
			nextWrapped[combatant.id] = tailEl.offsetTop - rowEl.offsetTop > 4;
		}
		setWrappedRows((current) => {
			return areWrappedMapsEqual(current, nextWrapped) ? current : nextWrapped;
		});

		const orderChanged = previousOrderKeyRef.current !== combatantOrderKey;
		if (suppressAnimationRef.current || !orderChanged) {
			suppressAnimationRef.current = false;
			previousCombatantRects.current = nextRects;
			previousOrderKeyRef.current = combatantOrderKey;
			return;
		}

		for (const [combatantId, currentRect] of nextRects) {
			const previousRect = previousCombatantRects.current.get(combatantId);
			if (!previousRect) {
				continue;
			}
			const deltaX = previousRect.left - currentRect.left;
			const deltaY = previousRect.top - currentRect.top;
			if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
				continue;
			}

			const element = combatantRowRefs.current.get(combatantId);
			if (!element) {
				continue;
			}
			element.getAnimations().forEach((animation) => animation.cancel());
			element.animate(
				[
					{ transform: `translate(${deltaX}px, ${deltaY}px)` },
					{ transform: "translate(0, 0)" },
				],
				{
					duration: 180,
					easing: "cubic-bezier(0.2, 0, 0, 1)",
				},
			);
		}

		previousCombatantRects.current = nextRects;
		previousOrderKeyRef.current = combatantOrderKey;
	}, [combatantOrderKey, session, layoutTick]);

	useEffect(() => {
		if (!activeCombatantId) {
			previousActiveCombatantIdRef.current = null;
			return;
		}
		if (previousActiveCombatantIdRef.current === activeCombatantId) {
			return;
		}

		previousActiveCombatantIdRef.current = activeCombatantId;
		const row = combatantRowRefs.current.get(activeCombatantId);
		if (!row) {
			return;
		}

		row.scrollIntoView({
			block: "nearest",
			inline: "nearest",
			behavior: "smooth",
		});
	}, [activeCombatantId]);

	// Render branch: either active combatants or an empty-state hint.
	// Toolbar is always shown so encounter controls remain reachable.
	return (
		<div
			ref={dashboardRootRef}
			className="encounter-cast-dashboard"
			onClick={() => {
				setSelectedCombatantIds([]);
			}}
		>
			<section className="encounter-cast-dashboard-encounter">
				<div className="encounter-cast-dashboard-panel-header">
					<div className="encounter-cast-dashboard-encounter-header-copy">
						<h2>DM Dashboard</h2>
						<p>
							{session
								? `Round ${session.round} · ${session.combatants.length} combatants`
								: "Run an encounter block to create a combat session."}
						</p>
					</div>
				</div>

				{session ? (
					<div
						className="encounter-cast-dashboard-combatants"
						onClick={(event) => {
							if (event.target === event.currentTarget) {
								setSelectedCombatantIds([]);
							}
						}}
					>
						{session.combatants.map((combatant, index) => (
							<CombatantRow
								key={combatant.id}
								combatant={combatant}
								index={index}
								isActive={index === session.activeIndex}
								isSelected={selectedCombatantIds.includes(combatant.id)}
								encounterRunning={model.encounterRunning}
								hoverPreviewEnabled={model.hoverPreviewEnabled}
								hoverPreviewDelayMs={model.hoverPreviewDelayMs}
								isDragTarget={draggingCombatantId !== null && dragTargetIndex === index}
								isWrapped={wrappedRows[combatant.id] === true}
								actions={actions}
								onSelect={selectCombatant}
								onContextMenu={openCombatantContextMenu}
								onRowRef={bindCombatantRowRef}
								onTailRef={bindCombatantTailRef}
								onDragStart={beginCombatantDrag}
								onDragEnd={endCombatantDrag}
								onDropOn={dropCombatantAtIndex}
								onDragTarget={setDragTargetIndex}
							/>
						))}
					</div>
				) : (
					<div className="encounter-cast-dashboard-empty">No active combat session.</div>
				)}
			</section>

			<div
				className="encounter-cast-dashboard-floating-controls"
				role="toolbar"
				aria-label="Encounter controls"
				onClick={(event) => {
					event.stopPropagation();
				}}
			>
				<IconButton
					icon={model.encounterRunning ? "square" : "play"}
					title={model.encounterRunning ? "Stop encounter" : "Start encounter"}
					onClick={model.encounterRunning ? actions.onStopEncounter : actions.onStartEncounter}
					disabled={!hasEncounter}
				/>
				<IconButton
					icon="skip-forward"
					title="Next turn"
					onClick={actions.onNextTurn}
					disabled={!canControlTurns}
				/>
				<IconButton icon="skull" title="Add monster" onClick={actions.onAddMonster} disabled={false} />
				<IconButton
					icon="trash"
					title="Clear monsters"
					onClick={actions.onClearMonsters}
					disabled={!hasEncounter}
				/>
				<IconButton
					icon="power"
					title={model.serverRunning ? "Stop server" : "Start server"}
					onClick={model.serverRunning ? actions.onStopServer : actions.onStartServer}
					className={`has-divider ${model.serverRunning ? "is-running" : "is-stopped"}`}
				/>
				<IconButton
					icon="copy"
					title="Copy invite link"
					onClick={() => {
						if (primaryInvite) {
							actions.onCopyInvite(primaryInvite);
						}
					}}
					disabled={!primaryInvite}
				/>
				<IconButton
					icon="qr-code"
					title="Show QR code"
					onClick={() => {
						if (primaryInvite) {
							actions.onShowInviteQr(primaryInvite);
						}
					}}
					disabled={!primaryInvite}
				/>
			</div>
		</div>
	);
}

// Initiative badge with crit styling (nat 1 / nat 20).
function InitiativeDie({
	value,
	title,
	isCriticalFailure,
	isCriticalSuccess,
	isEditable = false,
	editableValue = null,
	onCommit,
}: {
	value: string;
	title: string;
	isCriticalFailure: boolean;
	isCriticalSuccess: boolean;
	isEditable?: boolean;
	editableValue?: number | null;
	onCommit?: (value: string) => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [draftValue, setDraftValue] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!isEditing || !inputRef.current) {
			return;
		}

		const input = inputRef.current;
		input.focus();
		input.select();
	}, [isEditing]);

	const startEdit = () => {
		if (!isEditable) {
			return;
		}
		setDraftValue(editableValue === null ? "" : editableValue.toString());
		setIsEditing(true);
	};

	const commit = () => {
		setIsEditing(false);
		onCommit?.(draftValue.trim());
	};

	const cancel = () => {
		setIsEditing(false);
		setDraftValue(editableValue === null ? "" : editableValue.toString());
	};

	const stateClass = isCriticalFailure ? "is-crit-fail" : isCriticalSuccess ? "is-crit-success" : "";
	const className = `encounter-cast-initiative-die ${stateClass} ${isEditable ? "is-editable" : ""}`.trim();
	return (
		<span
			className={className}
			title={isEditable ? `${title} (double-click to edit)` : title}
			onDblClick={startEdit}
			role={isEditable ? "button" : undefined}
			tabIndex={isEditable ? 0 : undefined}
			aria-label={isEditable ? "Edit initiative modifier" : undefined}
			onKeyDown={(event) => {
				if (!isEditable) {
					return;
				}
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					startEdit();
				}
			}}
		>
			<svg className="encounter-cast-initiative-die-icon" viewBox="0 0 32 32" aria-hidden="true">
				<path d="M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z" />
			</svg>
			{isEditing ? (
				<input
					ref={inputRef}
					type="number"
					className="encounter-cast-glyph-input"
					value={draftValue}
					placeholder="-"
					onInput={(event) => setDraftValue(event.currentTarget.value)}
					onBlur={commit}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							cancel();
						}
					}}
				/>
			) : (
				<span className="encounter-cast-initiative-die-value">{value}</span>
			)}
		</span>
	);
}

// AC display glyph and value.
function ArmorClassShield({
	armorClass,
	isEditable = true,
	onCommit,
}: {
	armorClass: number | null;
	isEditable?: boolean;
	onCommit: (value: string) => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [draftValue, setDraftValue] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!isEditing || !inputRef.current) {
			return;
		}

		const input = inputRef.current;
		input.focus();
		input.select();
	}, [isEditing]);

	const startEdit = () => {
		if (!isEditable) {
			return;
		}
		setDraftValue(armorClass === null ? "" : armorClass.toString());
		setIsEditing(true);
	};

	const commit = () => {
		setIsEditing(false);
		onCommit(draftValue.trim());
	};

	const cancel = () => {
		setIsEditing(false);
		setDraftValue(armorClass === null ? "" : armorClass.toString());
	};

	return (
		<span
			className={`encounter-cast-ac-shield ${isEditable ? "is-editable" : ""}`.trim()}
			title={isEditable ? "Armor class (double-click to edit)" : "Armor class"}
			onDblClick={startEdit}
			role={isEditable ? "button" : undefined}
			tabIndex={isEditable ? 0 : undefined}
			aria-label={isEditable ? "Edit armor class" : undefined}
			onKeyDown={(event) => {
				if (!isEditable) {
					return;
				}
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					startEdit();
				}
			}}
		>
			<svg className="encounter-cast-ac-shield-icon" viewBox="0 0 32 32" aria-hidden="true">
				<path d="M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z" />
			</svg>
			{isEditing ? (
				<input
					ref={inputRef}
					type="number"
					className="encounter-cast-glyph-input"
					value={draftValue}
					placeholder="-"
					onInput={(event) => setDraftValue(event.currentTarget.value)}
					onBlur={commit}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							cancel();
						}
					}}
				/>
			) : (
				<span className="encounter-cast-ac-shield-value">{armorClass ?? "-"}</span>
			)}
		</span>
	);
}

// Reusable icon-only toolbar button wired to Obsidian icon set.
function IconButton({
	icon,
	title,
	onClick,
	disabled,
	className,
}: {
	icon: string;
	title: string;
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) {
	const iconRef = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		if (!iconRef.current) {
			return;
		}
		setIcon(iconRef.current, icon);
	}, [icon]);

	const classes = ["encounter-cast-dashboard-icon-button", className].filter(Boolean).join(" ");

	return (
		<button type="button" className={classes} aria-label={title} title={title} onClick={onClick} disabled={disabled}>
			<span ref={iconRef} className="encounter-cast-dashboard-icon" aria-hidden="true" />
		</button>
	);
}

interface CombatantRowProps {
	combatant: Combatant;
	index: number;
	isActive: boolean;
	isSelected: boolean;
	encounterRunning: boolean;
	hoverPreviewEnabled: boolean;
	hoverPreviewDelayMs: number;
	isDragTarget: boolean;
	isWrapped: boolean;
	actions: DashboardActions;
	onSelect: (combatant: Combatant, append: boolean) => void;
	onContextMenu: (event: MouseEvent, combatant: Combatant) => void;
	onRowRef: (combatantId: string, element: HTMLDivElement | null) => void;
	onTailRef: (combatantId: string, element: HTMLDivElement | null) => void;
	onDragStart: (combatantId: string) => void;
	onDragEnd: () => void;
	onDropOn: (targetIndex: number) => void;
	onDragTarget: (targetIndex: number | null) => void;
}

// One combatant row with drag/drop, initiative, stat fields, and statblock actions.
function CombatantRow({
	combatant,
	index,
	isActive,
	isSelected,
	encounterRunning,
	hoverPreviewEnabled,
	hoverPreviewDelayMs,
	isDragTarget,
	isWrapped,
	actions,
	onSelect,
	onContextMenu,
	onRowRef,
	onTailRef,
	onDragStart,
	onDragEnd,
	onDropOn,
	onDragTarget,
}: CombatantRowProps) {
	const isPlayerCombatant = combatant.monster.id.startsWith("player::");
	const showInfoButton = !isPlayerCombatant && !combatant.monster.id.startsWith("unresolved::");
	const initiativeDisplay = encounterRunning
		? (combatant.initiative?.toString() ?? "-")
		: combatant.dexMod === null
			? "-"
			: combatant.dexMod > 0
				? `+${combatant.dexMod}`
				: combatant.dexMod.toString();
	const initiativeTitle = encounterRunning
		? combatant.initiativeCriticalFailure
			? "Initiative roll: natural 1"
			: "Rolled initiative"
		: "Initiative modifier";

	return (
		<div
			ref={(element) => onRowRef(combatant.id, element)}
			className={`encounter-cast-combatant ${isActive ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${isDragTarget ? "is-drop-target" : ""} ${isWrapped ? "is-wrapped" : ""}`}
			onClick={(event) => {
				event.stopPropagation();
				onSelect(combatant, event.ctrlKey || event.metaKey);
			}}
			onDragOver={(event) => {
				event.preventDefault();
			}}
			onDragEnter={() => {
				onDragTarget(index);
			}}
			onDrop={(event) => {
				event.preventDefault();
				onDropOn(index);
			}}
			onContextMenu={(event) => {
				onContextMenu(event, combatant);
			}}
		>
			<div
				className="encounter-cast-combatant-drag-handle"
				title="Drag to reorder"
				aria-label="Drag to reorder"
				role="button"
				tabIndex={0}
				draggable
				onDragStart={(event) => {
					if (event.dataTransfer) {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", combatant.id);
					}
					onDragStart(combatant.id);
				}}
				onDragEnd={() => {
					onDragEnd();
				}}
			>
				<span className="encounter-cast-combatant-drag-grip" aria-hidden="true">
					<span className="encounter-cast-combatant-drag-dot-column" />
					<span className="encounter-cast-combatant-drag-dot-column" />
				</span>
			</div>

			<div className="encounter-cast-combatant-head">
				<InitiativeDie
					value={initiativeDisplay}
					title={initiativeTitle}
					isCriticalFailure={encounterRunning && combatant.initiativeCriticalFailure}
					isCriticalSuccess={encounterRunning && combatant.initiativeRoll === 20}
					isEditable={!encounterRunning && !isPlayerCombatant}
					editableValue={combatant.dexMod}
					onCommit={(value) => actions.onSetDexMod(combatant.id, value)}
				/>
				<div className="encounter-cast-combatant-name-block">
					<MonsterHoverPreviewTrigger
						monster={combatant.monster}
						enabled={hoverPreviewEnabled}
						delayMs={hoverPreviewDelayMs}
						onHoverInfo={actions.onHoverMonster}
						onHoverLeave={actions.onMonsterHoverLeave}
					>
						<div className="encounter-cast-combatant-name">{combatant.name}</div>
					</MonsterHoverPreviewTrigger>
					<div className="encounter-cast-combatant-original-name">{combatant.monsterName}</div>
				</div>
				{isPlayerCombatant && combatant.deathState === "down" ? (
					<DeathSaveIndicator
						successes={combatant.deathSaveSuccesses ?? 0}
						failures={combatant.deathSaveFailures ?? 0}
					/>
				) : null}
			</div>

			<div ref={(element) => onTailRef(combatant.id, element)} className="encounter-cast-combatant-tail">
				<div className="encounter-cast-combatant-wrap-dots" aria-hidden="true">
					<span className="encounter-cast-combatant-drag-dot-column" />
					<span className="encounter-cast-combatant-drag-dot-column" />
				</div>
				<ArmorClassShield
					armorClass={combatant.ac}
					isEditable={!isPlayerCombatant}
					onCommit={(value) => actions.onSetAc(combatant.id, value)}
				/>
				<div className="encounter-cast-combatant-stats-slot">
					{isPlayerCombatant ? (
						<div className="encounter-cast-combatant-player-hp" title="Player HP">
							<span className="encounter-cast-combatant-player-heart" aria-hidden="true">
								<svg viewBox="0 0 32 32">
									<path d="M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z" />
								</svg>
							</span>
							<span className="encounter-cast-combatant-player-hp-main">
								{combatant.hpCurrent ?? "-"} / {combatant.hpMax ?? "-"}
							</span>
							<span className="encounter-cast-combatant-player-temp">+{combatant.tempHp}</span>
						</div>
					) : (
						<div className="encounter-cast-combatant-hp-fields">
							<label>
								<span>HP</span>
								<input
									type="number"
									value={combatant.hpCurrent ?? ""}
									placeholder="-"
									onInput={(event) => actions.onSetHp(combatant.id, event.currentTarget.value)}
								/>
							</label>
							<label>
								<span>max HP</span>
								<input
									type="number"
									value={combatant.hpMax ?? ""}
									placeholder="-"
									onInput={(event) => actions.onSetHpMax(combatant.id, event.currentTarget.value)}
								/>
							</label>
							<label>
								<span>temp HP</span>
								<input
									type="number"
									value={combatant.tempHp}
									placeholder="0"
									onInput={(event) => actions.onSetTempHp(combatant.id, event.currentTarget.value)}
								/>
							</label>
						</div>
					)}
				</div>
				<div className="encounter-cast-combatant-row-end">
					{showInfoButton ? (
						<MonsterInfoButton onClick={() => actions.onOpenMonster(combatant.monster)} />
					) : (
						<MonsterInfoButtonGhost />
					)}
				</div>
			</div>
		</div>
	);
}

// Placeholder keeps unresolved rows aligned with resolved rows.
function MonsterInfoButtonGhost() {
	return (
		<button
			type="button"
			className="encounter-cast-combatant-info-button is-ghost"
			aria-hidden="true"
			tabIndex={-1}
			disabled
		>
			i
		</button>
	);
}
// Opens statblock details for resolved monsters.
function MonsterInfoButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className="encounter-cast-combatant-info-button"
			onClick={onClick}
			aria-label="Open statblock"
			title="Open statblock"
		>
			i
		</button>
	);
}

function DeathSaveIndicator({ successes, failures }: { successes: number; failures: number }) {
	const clampedSuccesses = Math.max(0, Math.min(3, Math.trunc(successes)));
	const clampedFailures = Math.max(0, Math.min(3, Math.trunc(failures)));
	const heartPath = "M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z";
	const skullPath = "M16 4C10.5 4 6 8.5 6 14v3.5c0 2.6 1.8 4.8 4.2 5.4V28h2.8v-2h6v2h2.8v-5.1c2.4-.6 4.2-2.8 4.2-5.4V14c0-5.5-4.5-10-10-10ZM12.2 13.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm7.6 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM13 20.2h6";
	const createDiamond = (filled: boolean) => {
		return <span className={`encounter-cast-death-save-diamond ${filled ? "is-filled" : ""}`} aria-hidden="true">{filled ? "◆" : "◇"}</span>;
	};

	return (
		<div className="encounter-cast-death-save-indicator" aria-label="Death saves">
			<div className="encounter-cast-death-save-row is-failures">
				<span className="encounter-cast-death-save-icon" aria-hidden="true">
					<svg viewBox="0 0 32 32"><path d={skullPath} /></svg>
				</span>
				{createDiamond(clampedFailures >= 1)}
				{createDiamond(clampedFailures >= 2)}
				{createDiamond(clampedFailures >= 3)}
			</div>
			<div className="encounter-cast-death-save-row is-successes">
				<span className="encounter-cast-death-save-icon" aria-hidden="true">
					<svg viewBox="0 0 32 32"><path d={heartPath} /></svg>
				</span>
				{createDiamond(clampedSuccesses >= 1)}
				{createDiamond(clampedSuccesses >= 2)}
				{createDiamond(clampedSuccesses >= 3)}
			</div>
		</div>
	);
}
