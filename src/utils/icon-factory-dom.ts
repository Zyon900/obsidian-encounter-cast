import { ICON_PATHS, type IconPathName } from "./icon-paths";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface DomIconOptions {
	className?: string;
	viewBox?: string;
	ariaHidden?: boolean;
	svgAttrs?: Record<string, string>;
	pathAttrs?: Record<string, string>;
}

// Creates a normalized SVG element for a named icon path with optional overrides.
export function createDomIconSvg(name: IconPathName, options: DomIconOptions = {}): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	const viewBox = options.viewBox ?? "0 0 32 32";
	svg.setAttribute("viewBox", viewBox);
	if (options.className) {
		svg.setAttribute("class", options.className);
	}
	if (options.ariaHidden !== false) {
		svg.setAttribute("aria-hidden", "true");
	}
	if (options.svgAttrs) {
		for (const [key, value] of Object.entries(options.svgAttrs)) {
			svg.setAttribute(key, value);
		}
	}
	setDomSvgIconPath(svg, name, options.pathAttrs);
	return svg;
}

// Applies or updates the first path child of an existing SVG using a named icon path.
export function setDomSvgIconPath(
	svg: SVGSVGElement,
	name: IconPathName,
	pathAttrs?: Record<string, string>,
): void {
	let path = svg.querySelector("path");
	if (!path) {
		path = document.createElementNS(SVG_NS, "path");
		svg.appendChild(path);
	}
	path.setAttribute("d", ICON_PATHS[name]);
	if (pathAttrs) {
		for (const [key, value] of Object.entries(pathAttrs)) {
			path.setAttribute(key, value);
		}
	}
}

export function createHexagonIconSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createDomIconSvg("hexagon", options);
}

export function createShieldIconSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createDomIconSvg("shield", options);
}

export function createHeartIconSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createDomIconSvg("heart", options);
}

export function createSkullIconSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createDomIconSvg("skull", options);
}
