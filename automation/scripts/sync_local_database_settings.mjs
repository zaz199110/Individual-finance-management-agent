#!/usr/bin/env node
/** Sync data/settings + app_settings.database from .env.local (local Supabase). */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const envPath = path.join(root, ".env.local");

function readDotEnv(file: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

const env = readDotEnv(envPath);
const apiUrl = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const dbContainer = "supabase_db_agent-demo-coding";

if (!apiUrl || !anonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const patch = path.join(__dirname, "patch_app_settings_database.mjs");
const res = spawnSync(
  process.execPath,
  [patch, apiUrl, anonKey, serviceKey ?? "", dbContainer, "passed"],
  { stdio: "inherit", cwd: root },
);

process.exit(res.status ?? 1);
