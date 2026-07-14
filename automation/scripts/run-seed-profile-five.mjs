#!/usr/bin/env node
/** Cross-platform seed runner → seed_profile_five_goals.py */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const pyOut = spawnSync(
  "node",
  [path.join(__dirname, "resolve-python.mjs"), "--require-psycopg"],
  { encoding: "utf8", cwd: root },
);
const py = (pyOut.stdout || "").trim() || (process.platform === "win32" ? "python" : "python3");
const pyParts =
  py.startsWith('"') && py.endsWith('"')
    ? [py.slice(1, -1)]
    : py.split(/\s+/);
const script = path.join(__dirname, "seed_profile_five_goals.py");

const result = spawnSync(pyParts[0], [...pyParts.slice(1), script], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status ?? 1);
