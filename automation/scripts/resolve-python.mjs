#!/usr/bin/env node
/**
 * Print a working Python command for the current OS (for shell scripts).
 * Usage: PY=$(node automation/scripts/resolve-python.mjs)
 *        node automation/scripts/resolve-python.mjs --require-psycopg
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const requirePsycopg = process.argv.includes("--require-psycopg");

if (process.env.PYTHON?.trim()) {
  process.stdout.write(process.env.PYTHON.trim());
  process.exit(0);
}

function run(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function candidateWorks(cmd, prefix) {
  if (run(cmd, [...prefix, "--version"]).status !== 0) return false;
  if (!requirePsycopg) return true;
  return run(cmd, [...prefix, "-c", "import psycopg"]).status === 0;
}

const candidates =
  process.platform === "win32"
    ? [
        { cmd: "python", prefix: [] },
        { cmd: "py", prefix: ["-3"] },
        { cmd: "python3", prefix: [] },
      ]
    : [
        { cmd: "python3", prefix: [] },
        { cmd: "python", prefix: [] },
      ];

for (const { cmd, prefix } of candidates) {
  if (candidateWorks(cmd, prefix)) {
    const label = cmd === "py" ? "py -3" : cmd;
    process.stdout.write(label);
    process.exit(0);
  }
}

// Windows: common Python install layout (user may have psycopg only here)
if (process.platform === "win32" && requirePsycopg) {
  const localApp = process.env.LOCALAPPDATA;
  if (localApp) {
    const pyRoot = `${localApp}\\Python`;
    if (fs.existsSync(pyRoot)) {
      for (const name of fs.readdirSync(pyRoot)) {
        if (!name.startsWith("pythoncore-")) continue;
        const exe = `${pyRoot}\\${name}\\python.exe`;
        if (!fs.existsSync(exe)) continue;
        if (run(exe, ["-c", "import psycopg"]).status === 0) {
          process.stdout.write(`"${exe}"`);
          process.exit(0);
        }
      }
    }
  }
}

process.stdout.write(process.platform === "win32" ? "python" : "python3");
