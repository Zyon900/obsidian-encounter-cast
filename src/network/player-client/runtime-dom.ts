import {
	createDomIconSvg,
	setDomSvgIconPath,
	type DomIconOptions,
} from "../../utils/icon-factory-dom";
import type { IconPathName } from "../../utils/icon-paths";

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
	return createDomIconSvg(name, options);
}

export function applyIconToSvg(svg: SVGSVGElement, name: IconPathName): void {
	setDomSvgIconPath(svg, name);
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
