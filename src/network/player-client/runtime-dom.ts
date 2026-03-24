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

export function createIconSvg(pathData: string): SVGSVGElement {
	const svgNs = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNs, "svg");
	svg.setAttribute("viewBox", "0 0 32 32");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(svgNs, "path");
	path.setAttribute("d", pathData);
	svg.appendChild(path);
	return svg;
}
