type IconPathName = "hexagon" | "shield" | "heart" | "skull";

interface DomIconOptions {
	className?: string;
	viewBox?: string;
	ariaHidden?: boolean;
	svgAttrs?: Record<string, string>;
	pathAttrs?: Record<string, string>;
}

export function requireEl<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!(el instanceof HTMLElement)) {
		throw new Error(`Missing required element: #${id}`);
	}
	return el as T;
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (options.className) {
		el.className = options.className;
	}
	if (options.text !== undefined) {
		el.textContent = options.text;
	}
	return el;
}

export function clearChildren(el: Element): void {
	while (el.firstChild) {
		el.removeChild(el.firstChild);
	}
}

export function createIconSvg(name: IconPathName, options: DomIconOptions = {}): SVGSVGElement {
	const svgNs = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNs, "svg");
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
	applyIconToSvg(svg, name, options.pathAttrs);
	return svg;
}

export function applyIconToSvg(svg: SVGSVGElement, name: string, pathAttrs?: Record<string, string>): void {
	const pathData = name === "hexagon"
		? "M16 2 27.8 8.7 27.8 23.3 16 30 4.2 23.3 4.2 8.7Z"
		: name === "shield"
			? "M16 2C18.4 3.5 21 4.8 27.4 7.1V15.8C27.4 22 23.2 27 16 30C8.8 27 4.6 22 4.6 15.8V7.1C11 4.8 13.6 3.5 16 2Z"
			: name === "heart"
				? "M16 28C10.4 24.3 5.2 19.5 5.2 13.3C5.2 9.4 8.2 6.4 12.1 6.4C13.7 6.4 15.1 6.9 16 7.9C16.9 6.9 18.3 6.4 19.9 6.4C23.8 6.4 26.8 9.4 26.8 13.3C26.8 19.5 21.6 24.3 16 28Z"
				: name === "skull"
					? "M16 4C10.5 4 6 8.5 6 14v3.5c0 2.6 1.8 4.8 4.2 5.4V28h2.8v-2h6v2h2.8v-5.1c2.4-.6 4.2-2.8 4.2-5.4V14c0-5.5-4.5-10-10-10ZM12.2 13.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm7.6 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM13 20.2h6"
					: null;
	if (!pathData) {
		return;
	}
	const svgNs = "http://www.w3.org/2000/svg";
	let path = svg.querySelector("path");
	if (!path) {
		path = document.createElementNS(svgNs, "path");
		svg.appendChild(path);
	}
	path.setAttribute("d", pathData);
	if (pathAttrs) {
		for (const [key, value] of Object.entries(pathAttrs)) {
			path.setAttribute(key, value);
		}
	}
}

export function createHexIconSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createIconSvg("hexagon", options);
}

export function createShieldSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createIconSvg("shield", options);
}

export function createHeartSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createIconSvg("heart", options);
}

export function createSkullSvg(options: DomIconOptions = {}): SVGSVGElement {
	return createIconSvg("skull", options);
}
