import QRCode from "qrcode";

export async function renderInviteQrSvg(inviteUrl: string): Promise<string> {
	try {
		return await QRCode.toString(inviteUrl, { type: "svg", width: 280, margin: 1 });
	} catch {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120"><rect width="100%" height="100%" fill="white"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="13" fill="black">Unable to render QR code</text></svg>`;
	}
}
