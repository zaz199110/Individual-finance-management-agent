import fs from "node:fs";
import path from "node:path";

import { getDataDir } from "@/lib/paths";
import type { CheckStatus } from "@/lib/supabase/server";

import { maskSecret } from "./mask";
import {
  resolveConfigSource,
  type ConfigSource,
} from "@/lib/settings/env-defaults";

const SETTINGS_KEY = "database";
const LOCAL_FILE = "database_settings.json";

let cachedStoredRaw: StoredDatabaseSettings | undefined;

export function invalidateDatabaseSettingsCache(): void {
  cachedStoredRaw = undefined;
}

export type DatabaseMode = "local" | "cloud";

export interface StoredDatabaseSettings {
  supabase_url?: string | null;
  anon_key?: string | null;
  service_role_key?: string | null;
  db_password?: string | null;
  check_status?: CheckStatus;
  last_checked_at?: string | null;
  last_error_message?: string | null;
  updated_at?: string | null;
  mode?: DatabaseMode | null;
}

export interface PublicDatabaseSettings {
  supabase_url: string | null;
  anon_key_masked: string | null;
  service_role_key_masked: string | null;
  db_password_masked: string | null;
  has_anon_key: boolean;
  has_service_role_key: boolean;
  has_db_password: boolean;
  check_status: CheckStatus;
  last_checked_at: string | null;
  last_error_message: string | null;
  updated_at: string | null;
  config_source: ConfigSource;
  mode: DatabaseMode;
  /** 当前有效模式为本地 */
  local_managed: boolean;
}

export interface ResolvedDatabaseCredentials {
  supabase_url: string;
  anon_key: string;
  service_role_key?: string;
  db_password?: string;
  check_status: CheckStatus;
  last_checked_at?: string | null;
  last_error_message?: string | null;
}

function localPath(): string {
  return path.join(getDataDir(), "settings", LOCAL_FILE);
}

function readLocal(): StoredDatabaseSettings | null {
  try {
    const p = localPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as StoredDatabaseSettings;
  } catch {
    return null;
  }
}

function writeLocal(data: StoredDatabaseSettings): void {
  const p = localPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

async function readStoredRaw(): Promise<StoredDatabaseSettings> {
  if (cachedStoredRaw !== undefined) return cachedStoredRaw;

  const { createClient } = await import("@supabase/supabase-js");
  const envUrl = process.env.SUPABASE_URL?.trim();
  const envKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim();
  if (envUrl && envKey) {
    try {
      const client = createClient(envUrl, envKey, { auth: { persistSession: false } });
      const { data } = await client
        .from("app_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (data?.value) {
        cachedStoredRaw = data.value as StoredDatabaseSettings;
        return cachedStoredRaw;
      }
    } catch {
      // fall through to local file
    }
  }
  cachedStoredRaw = readLocal() ?? {};
  return cachedStoredRaw;
}

async function invalidateRuntimeCaches(): Promise<void> {
  invalidateDatabaseSettingsCache();
  const { invalidateSupabaseCache } = await import("@/lib/supabase/server");
  invalidateSupabaseCache();
}

async function writeStored(data: StoredDatabaseSettings): Promise<void> {
  const payload = { ...data, updated_at: new Date().toISOString() };
  writeLocal(payload);

  const creds = await resolveDatabaseCredentialsFromStored(payload);
  if (!creds) return;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const key = creds.service_role_key ?? creds.anon_key;
    const client = createClient(creds.supabase_url, key, { auth: { persistSession: false } });
    await client.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: payload,
      updated_at: payload.updated_at,
    });
  } catch {
    // local file is enough until connection works
  }

  await invalidateRuntimeCaches();
}

function resolveDatabaseCredentialsFromStored(
  stored: StoredDatabaseSettings,
): ResolvedDatabaseCredentials | null {
  const mode = resolveDatabaseMode(stored);
  let supabase_url: string | undefined;
  let anon_key: string | undefined;

  if (mode === "local") {
    supabase_url = process.env.SUPABASE_URL?.trim();
    anon_key = process.env.SUPABASE_ANON_KEY?.trim();
  } else {
    supabase_url = stored.supabase_url?.trim() || process.env.SUPABASE_URL?.trim();
    anon_key = stored.anon_key?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  }

  if (!supabase_url || !anon_key) return null;
  return {
    supabase_url,
    anon_key,
    service_role_key:
      mode === "local"
        ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
        : stored.service_role_key?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    db_password:
      mode === "local"
        ? process.env.SUPABASE_DB_PASSWORD?.trim()
        : stored.db_password?.trim() || process.env.SUPABASE_DB_PASSWORD?.trim(),
    check_status: stored.check_status ?? "unchecked",
    last_checked_at: stored.last_checked_at ?? null,
    last_error_message: stored.last_error_message ?? null,
  };
}

/** 开发环境：Supabase 跑在本机 Docker（127.0.0.1 / localhost） */
export function isLocalSupabaseUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url.trim()).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/** `.env.local` 已注入本地栈密钥 */
export function isDatabaseManagedByLocalEnv(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  return Boolean(url && anon && isLocalSupabaseUrl(url));
}

/** 解析用户当前生效的数据空间模式：显式选择优先，否则根据 env 自动推断 */
export function resolveDatabaseMode(stored: StoredDatabaseSettings): DatabaseMode {
  if (stored.mode === "local" || stored.mode === "cloud") return stored.mode;
  return isDatabaseManagedByLocalEnv() ? "local" : "cloud";
}

export async function resolveDatabaseCredentials(): Promise<ResolvedDatabaseCredentials | null> {
  const stored = await readStoredRaw();
  return resolveDatabaseCredentialsFromStored(stored);
}

/** 配置表无数据库连接信息时，仅本地环境从 .env.local 写入 app_settings */
export async function seedDatabaseFromEnvIfEmpty(): Promise<boolean> {
  const stored = await readStoredRaw();
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return false;

  const savedUrl = stored.supabase_url?.trim();
  const savedAnon = stored.anon_key?.trim();
  const hasCompleteSaved = Boolean(savedUrl && savedAnon);
  const localManaged = isDatabaseManagedByLocalEnv();

  if (localManaged && (!hasCompleteSaved || !isLocalSupabaseUrl(savedUrl))) {
    await writeStored({
      supabase_url: url,
      anon_key: anon,
      service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
      db_password: process.env.SUPABASE_DB_PASSWORD?.trim() || null,
      check_status:
        hasCompleteSaved && stored.check_status === "passed"
          ? "passed"
          : "unchecked",
      last_checked_at: stored.last_checked_at ?? null,
      last_error_message: null,
    });
    return true;
  }

  if (hasCompleteSaved) return false;
  if (!localManaged) return false;

  await writeStored({
    ...stored,
    supabase_url: url,
    anon_key: anon,
    service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    db_password: process.env.SUPABASE_DB_PASSWORD?.trim() || null,
    check_status: "unchecked",
    last_checked_at: null,
    last_error_message: null,
  });
  return true;
}

export async function getPublicDatabaseSettings(): Promise<PublicDatabaseSettings> {
  const stored = await readStoredRaw();
  const mode = resolveDatabaseMode(stored);

  let supabase_url: string | null;
  let anon_key: string | null;
  let service_role_key: string | null;
  let db_password: string | null;
  let config_source: ConfigSource;

  if (mode === "local") {
    supabase_url = process.env.SUPABASE_URL?.trim() || null;
    anon_key = process.env.SUPABASE_ANON_KEY?.trim() || null;
    service_role_key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
    db_password = process.env.SUPABASE_DB_PASSWORD?.trim() || null;
    config_source = "env";
  } else {
    supabase_url = stored.supabase_url?.trim() || null;
    anon_key = stored.anon_key?.trim() || null;
    service_role_key = stored.service_role_key?.trim() || null;
    db_password = stored.db_password?.trim() || null;
    config_source = resolveConfigSource(
      Boolean(stored.supabase_url?.trim() && stored.anon_key?.trim()),
      false,
    );
  }

  return {
    supabase_url,
    anon_key_masked: maskSecret(anon_key),
    service_role_key_masked: maskSecret(service_role_key),
    db_password_masked: maskSecret(db_password),
    has_anon_key: Boolean(anon_key),
    has_service_role_key: Boolean(service_role_key),
    has_db_password: Boolean(db_password),
    check_status: stored.check_status ?? "unchecked",
    last_checked_at: stored.last_checked_at ?? null,
    last_error_message: stored.last_error_message ?? null,
    updated_at: stored.updated_at ?? null,
    config_source,
    mode,
    local_managed: mode === "local",
  };
}

export async function patchDatabaseSettings(input: {
  supabase_url?: string;
  anon_key?: string;
  service_role_key?: string;
  db_password?: string;
  clear_service_role_key?: boolean;
  clear_db_password?: boolean;
  mode?: DatabaseMode;
}): Promise<PublicDatabaseSettings> {
  const stored = await readStoredRaw();

  if (input.mode !== undefined) {
    const currentMode = resolveDatabaseMode(stored);
    if (input.mode !== currentMode) {
      const next: StoredDatabaseSettings = {
        ...stored,
        mode: input.mode,
        check_status: "unchecked",
        last_checked_at: null,
        last_error_message: null,
      };
      await writeStored(next);
      invalidateRuntimeCaches();
    }
    return getPublicDatabaseSettings();
  }

  const currentMode = resolveDatabaseMode(stored);
  if (currentMode === "local") {
    return getPublicDatabaseSettings();
  }

  const next: StoredDatabaseSettings = { ...stored, check_status: "unchecked" };

  if (input.supabase_url !== undefined) {
    next.supabase_url = input.supabase_url.trim() || null;
  }
  if (input.anon_key !== undefined && input.anon_key.trim()) {
    next.anon_key = input.anon_key.trim();
  }
  if (input.service_role_key !== undefined && input.service_role_key.trim()) {
    next.service_role_key = input.service_role_key.trim();
  } else if (input.clear_service_role_key) {
    next.service_role_key = null;
  }
  if (input.db_password !== undefined && input.db_password.trim()) {
    next.db_password = input.db_password.trim();
  } else if (input.clear_db_password) {
    next.db_password = null;
  }

  next.last_checked_at = null;
  next.last_error_message = null;
  await writeStored(next);
  return getPublicDatabaseSettings();
}

export async function updateDatabaseCheck(input: {
  status: CheckStatus;
  error_message?: string | null;
}): Promise<void> {
  const stored = await readStoredRaw();
  stored.check_status = input.status;
  stored.last_checked_at = new Date().toISOString();
  stored.last_error_message = input.error_message ?? null;
  await writeStored(stored);
}
