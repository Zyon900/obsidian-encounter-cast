interface QrPanelProps {
	token: string;
	inviteLink: string;
	onBack: () => void;
}

export function QrPanel({ token, inviteLink, onBack }: QrPanelProps) {
	return (
		<div className="panel qr-panel" id="qrPanel">
			<h3>Join via QR-Code</h3>
			<div className="qr-image-wrap">
				<div className="qr-image-frame">
					<img id="qrImage" alt="Join encounter QR code" src={`/api/invite-qr?token=${encodeURIComponent(token)}&v=${Date.now()}`} />
				</div>
			</div>
			<a id="qrLink" className="qr-link" href={inviteLink} target="_blank" rel="noopener noreferrer">{inviteLink}</a>
			<div className="row"><button id="qrBackBtn" className="secondary-btn" type="button" onClick={onBack}>Back</button></div>
		</div>
	);
}
