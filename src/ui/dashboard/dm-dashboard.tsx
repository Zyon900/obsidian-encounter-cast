import QRCode from "qrcode";
import { useEffect, useState } from "preact/hooks";
import type { Combatant } from "../../encounter/combat-session";
import { MonsterHoverPreviewTrigger } from "../monsters/monster-hover-preview-trigger";
import type { DashboardActions, DashboardViewModel } from "./types";

interface DmDashboardProps {
	model: DashboardViewModel;
	actions: DashboardActions;
}

export function DmDashboard({ model, actions }: DmDashboardProps) {
	const primaryInvite = model.inviteUrls[0] ?? null;
	const session = model.session;

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

				<div className="encounter-cast-dashboard-actions">
					{model.serverRunning ? (
						<button type="button" onClick={actions.onStopServer}>
							Stop server
						</button>
					) : (
						<button type="button" onClick={actions.onStartServer}>
							Start server
						</button>
					)}
					<button
						type="button"
						onClick={() => {
							if (primaryInvite) {
								actions.onCopyInvite(primaryInvite);
							}
						}}
						disabled={!primaryInvite}
					>
						Copy invite link
					</button>
					<button type="button" onClick={actions.onNextTurn} disabled={!session || session.combatants.length === 0}>
						Next turn
					</button>
				</div>

				{primaryInvite ? <InviteQrCode url={primaryInvite} /> : null}

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
		</div>
	);
}

function InviteQrCode({ url }: { url: string }) {
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setSvg(null);
		setError(null);
		void QRCode.toString(url, {
			type: "svg",
			margin: 1,
			width: 176,
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
		<div className="encounter-cast-dashboard-qr">
			<div className="encounter-cast-dashboard-subtitle">QR code</div>
			{svg ? (
				<div
					className="encounter-cast-dashboard-qr-frame"
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			) : (
				<p>{error ?? "Generating QR code..."}</p>
			)}
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
						<span>DEX {combatant.dex ?? "-"}</span>
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
