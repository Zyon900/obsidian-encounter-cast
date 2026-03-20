import QRCode from "qrcode";
import { setIcon } from "obsidian";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Combatant } from "../../encounter/combat-session";
import { MonsterHoverPreviewTrigger } from "../monsters/monster-hover-preview-trigger";
import type { DashboardActions, DashboardViewModel } from "./types";

interface DmDashboardProps {
	model: DashboardViewModel;
	actions: DashboardActions;
}

export function DmDashboard({ model, actions }: DmDashboardProps) {
	const [isQrOpen, setIsQrOpen] = useState(false);
	const primaryInvite = model.inviteUrls[0] ?? null;
	const session = model.session;
	const canControlTurns = Boolean(session && model.encounterRunning && session.combatants.length > 0);
	const hasEncounter = Boolean(session);

	return (
		<div className="encounter-cast-dashboard">
			<section className="encounter-cast-dashboard-panel">
				<div className="encounter-cast-dashboard-panel-header">
					<div>
						<h2>DM dashboard</h2>
						<p>Control the active encounter and expose the session over the local network.</p>
					</div>
					<div className="encounter-cast-dashboard-server-status">
						<span className={model.serverRunning ? "is-online" : "is-offline"}>
							{model.serverRunning ? "Server online" : "Server offline"}
						</span>
						{model.serverPort !== null ? <span>Port {model.serverPort}</span> : null}
					</div>
				</div>

				{model.roomToken ? (
					<div className="encounter-cast-dashboard-token">
						<span>Room token</span>
						<code>{model.roomToken}</code>
					</div>
				) : null}

				<div className="encounter-cast-dashboard-invites">
					<div className="encounter-cast-dashboard-subtitle">Invite links</div>
					{model.inviteUrls.length > 0 ? (
						model.inviteUrls.map((url) => (
							<div key={url} className="encounter-cast-dashboard-invite-row">
								<code>{url}</code>
								<button type="button" onClick={() => actions.onCopyInvite(url)}>
									Copy
								</button>
							</div>
						))
					) : (
						<p>No invite links until the server is running.</p>
					)}
				</div>
			</section>

			<section className="encounter-cast-dashboard-panel">
				<div className="encounter-cast-dashboard-panel-header">
					<div>
						<h2>{session?.title ?? "Current encounter"}</h2>
						<p>
							{session
								? `Round ${session.round} · ${session.combatants.length} combatants`
								: "Run an encounter block to create a combat session."}
						</p>
					</div>
				</div>

				{session ? (
					<div className="encounter-cast-dashboard-combatants">
						{session.combatants.map((combatant, index) => (
							<CombatantRow
								key={combatant.id}
								combatant={combatant}
								isActive={index === session.activeIndex}
								isFirst={index === 0}
								isLast={index === session.combatants.length - 1}
								actions={actions}
							/>
						))}
					</div>
				) : (
					<div className="encounter-cast-dashboard-empty">No active combat session.</div>
				)}
			</section>

			<div className="encounter-cast-dashboard-floating-controls" role="toolbar" aria-label="Encounter controls">
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
				<IconButton
					icon="skull"
					title="Add monster"
					onClick={actions.onAddMonster}
					disabled={false}
				/>
				<IconButton
					icon="power"
					title={model.serverRunning ? "Stop server" : "Start server"}
					onClick={model.serverRunning ? actions.onStopServer : actions.onStartServer}
					className={model.serverRunning ? "is-running" : "is-stopped"}
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
					onClick={() => setIsQrOpen(true)}
					disabled={!primaryInvite}
				/>
			</div>

			{isQrOpen && primaryInvite ? (
				<QrCodeModal
					url={primaryInvite}
					onClose={() => {
						setIsQrOpen(false);
					}}
				/>
			) : null}
		</div>
	);
}

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

function QrCodeModal({ url, onClose }: { url: string; onClose: () => void }) {
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setSvg(null);
		setError(null);
		void QRCode.toString(url, {
			type: "svg",
			margin: 1,
			width: 240,
		}).then(
			(markup: string) => {
				if (!cancelled) {
					setSvg(markup);
				}
			},
			() => {
				if (!cancelled) {
					setError("QR code unavailable.");
				}
			},
		);

		return () => {
			cancelled = true;
		};
	}, [url]);

	return (
		<div className="encounter-cast-dashboard-modal-backdrop" onClick={onClose}>
			<div
				className="encounter-cast-dashboard-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Invite QR code"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="encounter-cast-dashboard-modal-header">
					<h3>Invite QR code</h3>
					<button type="button" onClick={onClose} aria-label="Close QR code modal" title="Close">
						×
					</button>
				</div>
				{svg ? (
					<div className="encounter-cast-dashboard-qr-frame" dangerouslySetInnerHTML={{ __html: svg }} />
				) : (
					<p>{error ?? "Generating QR code..."}</p>
				)}
				<code>{url}</code>
			</div>
		</div>
	);
}

interface CombatantRowProps {
	combatant: Combatant;
	isActive: boolean;
	isFirst: boolean;
	isLast: boolean;
	actions: DashboardActions;
}

function CombatantRow({ combatant, isActive, isFirst, isLast, actions }: CombatantRowProps) {
	return (
		<div className={`encounter-cast-combatant ${isActive ? "is-active" : ""}`}>
			<div className="encounter-cast-combatant-main">
				<button
					type="button"
					className="encounter-cast-combatant-activate"
					onClick={() => actions.onActivateCombatant(combatant.id)}
				>
					{isActive ? "Active" : "Set active"}
				</button>
				<div className="encounter-cast-combatant-copy">
					<MonsterHoverPreviewTrigger
						monster={combatant.monster}
						onHoverInfo={actions.onHoverMonster}
						onHoverLeave={actions.onMonsterHoverLeave}
					>
						<div className="encounter-cast-combatant-name">{combatant.name}</div>
					</MonsterHoverPreviewTrigger>
					<div className="encounter-cast-combatant-meta">
						<span>{combatant.monsterName}</span>
						<span>CR {combatant.challenge ?? "-"}</span>
						<span>DEX mod {combatant.dexMod ?? "-"}</span>
						<span>
							INIT {combatant.initiative ?? "-"}
							{combatant.initiativeCriticalFailure ? (
								<>
									{" "}(
									<span className="encounter-cast-combatant-init-crit" title="Critical failure on initiative roll">
										1
									</span>
									)
								</>
							) : null}
						</span>
					</div>
				</div>
			</div>

			<div className="encounter-cast-combatant-controls">
				<label>
					<span>HP</span>
					<input
						type="number"
						value={combatant.hpCurrent ?? ""}
						placeholder={combatant.hpMax?.toString() ?? "-"}
						onInput={(event) => actions.onSetHp(combatant.id, (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>AC</span>
					<input
						type="number"
						value={combatant.ac ?? ""}
						placeholder="-"
						onInput={(event) => actions.onSetAc(combatant.id, (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>Init mod</span>
					<input
						type="number"
						value={combatant.dexMod ?? ""}
						placeholder="-"
						onInput={(event) => actions.onSetDexMod(combatant.id, (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<div className="encounter-cast-combatant-buttons">
					<button type="button" onClick={() => actions.onMoveCombatant(combatant.id, "up")} disabled={isFirst}>
						Up
					</button>
					<button type="button" onClick={() => actions.onMoveCombatant(combatant.id, "down")} disabled={isLast}>
						Down
					</button>
					<button type="button" onClick={() => actions.onOpenMonster(combatant.monster)}>
						Open monster
					</button>
				</div>
			</div>
		</div>
	);
}




