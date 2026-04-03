import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const tempDir = path.join(".tmp");
const tempBundlePath = path.join(tempDir, "player-client.embed.js");
const outputPath = path.join("src", "network", "player-client", "player-client-embedded.ts");
const esbuildBin = path.join("node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");

mkdirSync(tempDir, { recursive: true });

execFileSync(esbuildBin, [
	"src/network/player-client/app.tsx",
	"--bundle",
	"--format=iife",
	"--platform=browser",
	"--target=es2018",
	"--jsx=automatic",
	"--jsx-import-source=preact",
	"--log-level=error",
	`--outfile=${tempBundlePath}`,
], { stdio: "inherit" });

if (!existsSync(tempBundlePath)) {
	throw new Error(`Expected bundle output at ${tempBundlePath}, but it was not created.`);
}

const bundledScript = readFileSync(tempBundlePath, "utf8");
if (!bundledScript.length) {
	throw new Error("Generated player client bundle is empty.");
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(
	outputPath,
	`export const PLAYER_CLIENT_SCRIPT = ${JSON.stringify(bundledScript)};\n`,
	"utf8",
);

rmSync(tempBundlePath, { force: true });

console.log(`[embed] wrote ${outputPath}`);
