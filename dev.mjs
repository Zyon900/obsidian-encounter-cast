/* eslint-env node */
import { spawn } from "node:child_process";

const run = (args) =>
	spawn("bun", args, {
		stdio: "inherit",
		shell: process.platform === "win32",
	});

const stylesWatcher = run(["run", "watch:styles"]);
const esbuildWatcher = run(["run", "esbuild.config.mjs"]);

const shutdown = () => {
	stylesWatcher.kill();
	esbuildWatcher.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

esbuildWatcher.on("exit", (code) => {
	shutdown();
	process.exit(code ?? 0);
});

stylesWatcher.on("exit", (code) => {
	if (code && code !== 0) {
		shutdown();
		process.exit(code);
	}
});

