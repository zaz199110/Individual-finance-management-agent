#!/usr/bin/env node
/** Sync app_settings.database + data/settings/database_settings.json for local Supabase. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const [apiUrl, anonKey, serviceKey, dbContainer, markPassed] = process.argv.slice(2);
if (!apiUrl || !anonKey || !dbContainer) {
  console.error(
    "usage: patch_app_settings_database.mjs <apiUrl> <anonKey> <serviceKey> <dbContainer> [passed]",
  );
  process.exit(1);
}

const now = new Date().toISOString();
const passed = markPassed === "passed";

const value = {
  supabase_url: apiUrl,
  anon_key: anonKey,
  service_role_key: serviceKey ?? null,
  db_password: "postgres",
  check_status: passed ? "passed" : "unchecked",
  last_checked_at: passed ? now : null,
  last_error_message: null,
  updated_at: now,
};

const settingsDir = path.join(root, "data", "settings");
fs.mkdirSync(settingsDir, { recursive: true });
fs.writeFileSync(
  path.join(settingsDir, "database_settings.json"),
  `${JSON.stringify(value, null, 2)}\n`,
  "utf8",
);
console.log("Wrote data/settings/database_settings.json");

const json = JSON.stringify(value).replace(/'/g, "''");
const sql = `INSERT INTO app_settings (key, value, updated_at)
VALUES ('database', '${json}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;`;
const dbUrl = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const res = spawnSync(
  "docker",
  ["exec", dbContainer, "psql", dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
  { encoding: "utf8", stdio: "inherit" },
);

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log("Updated app_settings.database in local Postgres");
