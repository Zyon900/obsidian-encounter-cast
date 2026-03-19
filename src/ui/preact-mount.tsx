import { render } from "preact";
import { EncounterCastApp } from "./encounter-cast-app";
import type { FoundationViewModel } from "./types";

export class PreactMount {
	constructor(private readonly container: HTMLElement) {}

	update(state: FoundationViewModel): void {
		render(<EncounterCastApp state={state} />, this.container);
	}

	unmount(): void {
		render(null, this.container);
	}
}
