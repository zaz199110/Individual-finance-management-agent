import fs from "node:fs";
import path from "node:path";

/** Load .env.local or fallback secrets paths for acceptance tests. */
export function loadTestEnv(force = true): void {
  const root = process.cwd();
  const candidates = [
    path.join(root, ".env.local"),
    path.join(root, "requirement", "config", "secrets.env"),
    path.join(root, "..", "agent-demo", "requirement", "config", "secrets.env"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (force || !process.env[key]) process.env[key] = val;
    }
    break;
  }
}
