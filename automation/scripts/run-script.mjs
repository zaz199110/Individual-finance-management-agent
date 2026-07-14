#!/usr/bin/env node
/**
 * Cross-platform npm script runner — picks .ps1 on Windows, .sh elsewhere.
 * Usage: node automation/scripts/run-script.mjs <acceptance|gaps|all|bootstrap|selftest> [args...]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const isWin = process.platform === "win32";
const name = process.argv[2];
const extraArgs = process.argv.slice(3);

const map = {
  acceptance: isWin ? "run_acceptance.ps1" : "run_acceptance.sh",
  gaps: isWin ? "run_gaps.ps1" : "run_gaps.sh",
  all: isWin ? "run_all.ps1" : "run_all.sh",
  bootstrap: isWin ? "bootstrap_env.ps1" : "bootstrap_env.sh",
  selftest: isWin ? "self_test.ps1" : "self_test.sh",
  "dev:stop": isWin ? "stop_dev.ps1" : null,
  "dev:clean": isWin ? "dev_clean.ps1" : null,
};

if (!name || !(name in map)) {
  console.error("Usage: run-script.mjs <acceptance|gaps|all|bootstrap|selftest|dev:stop|dev:clean>");
  process.exit(1);
}

if (!map[name]) {
  console.error(`${name} is only available on Windows (see automation/INDEX.md §7b)`);
  process.exit(1);
}

const scriptPath = path.join(__dirname, map[name]);
const cmd = isWin ? "powershell" : "bash";
const args = isWin
  ? ["-ExecutionPolicy", "Bypass", "-File", scriptPath, ...extraArgs]
  : [scriptPath, ...extraArgs];

const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
