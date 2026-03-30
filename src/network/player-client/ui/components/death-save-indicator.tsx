import {
	createHeartIconElement,
	createSkullIconElement,
} from "../../../../utils/icon-factory-tsx";

interface DeathSaveIndicatorProps {
	successes: number;
	failures: number;
	className: string;
}

export function DeathSaveIndicator({ successes, failures, className }: DeathSaveIndicatorProps) {
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
