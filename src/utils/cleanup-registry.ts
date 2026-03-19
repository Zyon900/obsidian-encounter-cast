export type CleanupFn = () => void;

export class CleanupRegistry {
	private readonly cleanups = new Set<CleanupFn>();
	private readonly debounceTimers = new Map<string, number>();

	add(cleanup: CleanupFn): CleanupFn {
		this.cleanups.add(cleanup);
		return cleanup;
	}

	remove(cleanup: CleanupFn): void {
		this.cleanups.delete(cleanup);
	}

	debounce(key: string, delayMs: number, fn: () => void): void {
		const existing = this.debounceTimers.get(key);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}

		const timerId = window.setTimeout(() => {
			this.debounceTimers.delete(key);
			fn();
		}, delayMs);

		this.debounceTimers.set(key, timerId);
	}

	dispose(): void {
		for (const timerId of this.debounceTimers.values()) {
			window.clearTimeout(timerId);
		}
		this.debounceTimers.clear();

		for (const cleanup of this.cleanups) {
			cleanup();
		}
		this.cleanups.clear();
	}
}