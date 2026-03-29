import type { JSX } from "preact";
import { ICON_PATHS, type IconPathName } from "./icon-paths";

type SvgAttrMap = Record<string, string | number | boolean | undefined>;

export interface IconElementOptions {
	className?: string;
	viewBox?: string;
	ariaHidden?: boolean;
	svgProps?: SvgAttrMap;
	pathProps?: SvgAttrMap;
}

// Renders a named icon SVG element with optional per-call SVG/path customization.
export function createIconElement(name: IconPathName, options: IconElementOptions = {}): JSX.Element {
	const {
		className,
		viewBox = "0 0 32 32",
		ariaHidden = true,
		svgProps,
		pathProps,
	} = options;
	return (
		<svg viewBox={viewBox} className={className} aria-hidden={ariaHidden ? "true" : undefined} {...svgProps}>
			<path d={ICON_PATHS[name]} {...pathProps} />
		</svg>
	);
}

export function createHexagonIconElement(options: IconElementOptions = {}): JSX.Element {
	return createIconElement("hexagon", options);
}

export function createShieldIconElement(options: IconElementOptions = {}): JSX.Element {
	return createIconElement("shield", options);
}

export function createHeartIconElement(options: IconElementOptions = {}): JSX.Element {
	return createIconElement("heart", options);
}

export function createSkullIconElement(options: IconElementOptions = {}): JSX.Element {
	return createIconElement("skull", options);
}
