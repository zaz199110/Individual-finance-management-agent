#!/usr/bin/env node
/**
 * Run a Python script with OS-appropriate interpreter.
 * Usage: node automation/scripts/run-python.mjs automation/scripts/validate_registry.py
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const scriptArg = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!scriptArg) {
  console.error("Usage: node automation/scripts/run-python.mjs <script.py> [args...]");
  process.exit(1);
}

const pyOut = spawnSync("node", [path.join(__dirname, "resolve-python.mjs")], {
  encoding: "utf8",
  cwd: root,
});
const py = (pyOut.stdout || "").trim() || (process.platform === "win32" ? "python" : "python3");
const pyParts = py.split(/\s+/);
const script = path.isAbsolute(scriptArg) ? scriptArg : path.join(root, scriptArg);

const result = spawnSync(pyParts[0], [...pyParts.slice(1), script, ...extraArgs], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status ?? 1);
