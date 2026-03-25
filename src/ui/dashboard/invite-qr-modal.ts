import QRCode from "qrcode";
import { Modal, type App } from "obsidian";

export class InviteQrModal extends Modal {
	private readonly url: string;
	private closed = false;

	constructor(app: App, url: string) {
		super(app);
		this.url = url;
	}

	override onOpen(): void {
		this.closed = false;
		this.setTitle("Invite code");
		this.modalEl.addClass("encounter-cast-qr-modal-window");
		this.contentEl.empty();
		this.contentEl.addClass("encounter-cast-qr-modal-content");

		const frame = this.contentEl.createDiv({ cls: "encounter-cast-dashboard-qr-frame" });
		const status = this.contentEl.createEl("p", { text: "Generating invite code..." });
		const link = this.contentEl.createEl("a", {
			cls: "encounter-cast-dashboard-modal-link",
			text: this.url,
			href: this.url,
		});
		link.target = "_blank";
		link.rel = "noopener noreferrer";

		void QRCode.toString(this.url, {
			type: "svg",
			margin: 1,
			width: 240,
		}).then(
			(markup) => {
				if (this.closed) {
					return;
				}
				frame.empty();
				const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
				const svgEl = parsed.documentElement;
				if (svgEl instanceof SVGElement) {
					frame.appendChild(svgEl);
				}
				status.remove();
			},
			() => {
				if (this.closed) {
					return;
				}
				status.setText("Invite code unavailable.");
			},
		);

	}

	override onClose(): void {
		this.closed = true;
		this.modalEl.removeClass("encounter-cast-qr-modal-window");
		this.contentEl.empty();
	}
}
