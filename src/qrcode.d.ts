declare module "qrcode" {
	export interface QRCodeToStringOptions {
		type?: "svg" | "utf8" | "terminal";
		margin?: number;
		width?: number;
	}

	const QRCode: {
		toString(text: string, options?: QRCodeToStringOptions): Promise<string>;
	};

	export default QRCode;
}
