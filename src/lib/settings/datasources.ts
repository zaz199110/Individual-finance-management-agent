import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/paths";
import { getSupabase } from "@/lib/supabase/server";
import type { CheckStatus, DataSourceSettings } from "@/lib/l0/types";
import {
  resolveConfigSource,
  type ConfigSource,
} from "@/lib/settings/env-defaults";

const SETTINGS_KEY = "data_sources";
const LOCAL_FILE = "data_source_settings.json";

interface StoredSettings {
  tushare_token?: string | null;
  tushare_check_status?: CheckStatus;
  tushare_last_checked_at?: string | null;
  tushare_last_error_message?: string | null;
  akshare_check_status?: CheckStatus;
  akshare_last_checked_at?: string | null;
  akshare_last_error_message?: string | null;
  updated_at?: string | null;
}

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token.length <= 8) return "••••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

function localPath(): string {
  return path.join(getDataDir(), "settings", LOCAL_FILE);
}

function readLocal(): StoredSettings | null {
  try {
    const p = localPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as StoredSettings;
  } catch {
    return null;
  }
}

function writeLocal(data: StoredSettings): void {
  const p = localPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

async function readStored(): Promise<StoredSettings> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (data?.value) return data.value as StoredSettings;
  }
  return readLocal() ?? {};
}

async function writeStored(data: StoredSettings): Promise<void> {
  const payload = { ...data, updated_at: new Date().toISOString() };
  const supabase = await getSupabase();
  if (supabase) {
    await supabase.from("app_settings").upsert({
      key: SETTINGS_KEY,
      value: payload,
      updated_at: payload.updated_at,
    });
  }
  writeLocal(payload);
}

export async function getDataSourceSettings(): Promise<DataSourceSettings> {
  const stored = await readStored();
  const envToken = process.env.TUSHARE_TOKEN?.trim() || null;
  const token = stored.tushare_token?.trim() || envToken;

  return {
    tushare_token: token,
    tushare_token_masked: maskToken(token),
    tushare_check_status: stored.tushare_check_status ?? "unchecked",
    tushare_last_checked_at: stored.tushare_last_checked_at ?? null,
    tushare_last_error_message: stored.tushare_last_error_message ?? null,
    akshare_check_status: stored.akshare_check_status ?? "unchecked",
    akshare_last_checked_at: stored.akshare_last_checked_at ?? null,
    akshare_last_error_message: stored.akshare_last_error_message ?? null,
    updated_at: stored.updated_at ?? null,
  };
}

/** 设置页展示：已保存优先，否则 .env.local 默认值 */
export async function getPublicDataSourceSettings(): Promise<
  Omit<DataSourceSettings, "tushare_token"> & { config_source: ConfigSource }
> {
  const stored = await readStored();
  const savedToken = stored.tushare_token?.trim() || null;
  const envToken = process.env.TUSHARE_TOKEN?.trim() || null;
  const token = savedToken || envToken;
  const config_source = resolveConfigSource(Boolean(savedToken), Boolean(envToken));

  return {
    ...toPublicSettings({
      tushare_token: token,
      tushare_token_masked: maskToken(token),
      tushare_check_status: stored.tushare_check_status ?? "unchecked",
      tushare_last_checked_at: stored.tushare_last_checked_at ?? null,
      tushare_last_error_message: stored.tushare_last_error_message ?? null,
      akshare_check_status: stored.akshare_check_status ?? "unchecked",
      akshare_last_checked_at: stored.akshare_last_checked_at ?? null,
      akshare_last_error_message: stored.akshare_last_error_message ?? null,
      updated_at: stored.updated_at ?? null,
    }),
    config_source,
  };
}

/** 配置表无 Tushare Token 时，从 .env.local 写入 app_settings */
export async function seedTushareFromEnvIfEmpty(): Promise<boolean> {
  const stored = await readStored();
  if (stored.tushare_token?.trim()) return false;

  const envToken = process.env.TUSHARE_TOKEN?.trim();
  if (!envToken) return false;

  await writeStored({
    ...stored,
    tushare_token: envToken,
    tushare_check_status: "unchecked",
    tushare_last_checked_at: null,
    tushare_last_error_message: null,
  });
  return true;
}

/** SET-DS-02: settings page token overrides env. */
export async function resolveTushareToken(): Promise<string | null> {
  const settings = await getDataSourceSettings();
  return settings.tushare_token?.trim() || null;
}

export async function patchDataSourceSettings(input: {
  tushare_token?: string | null;
  clear_tushare_token?: boolean;
}): Promise<DataSourceSettings> {
  const stored = await readStored();
  const next: StoredSettings = { ...stored };

  if (input.clear_tushare_token) {
    next.tushare_token = null;
    next.tushare_check_status = "unchecked";
    next.tushare_last_checked_at = null;
    next.tushare_last_error_message = null;
  } else if (input.tushare_token !== undefined) {
    const trimmed = input.tushare_token?.trim() || null;
    next.tushare_token = trimmed;
    next.tushare_check_status = "unchecked";
    next.tushare_last_checked_at = null;
    next.tushare_last_error_message = null;
  }

  await writeStored(next);
  return getDataSourceSettings();
}

export async function updateDataSourceCheck(input: {
  provider: "tushare" | "akshare";
  status: CheckStatus;
  error_message?: string | null;
}): Promise<void> {
  const stored = await readStored();
  const now = new Date().toISOString();
  if (input.provider === "tushare") {
    stored.tushare_check_status = input.status;
    stored.tushare_last_checked_at = now;
    stored.tushare_last_error_message = input.error_message ?? null;
  } else {
    stored.akshare_check_status = input.status;
    stored.akshare_last_checked_at = now;
    stored.akshare_last_error_message = input.error_message ?? null;
  }
  await writeStored(stored);
}

export function toPublicSettings(settings: DataSourceSettings): Omit<DataSourceSettings, "tushare_token"> {
  const { tushare_token: _omit, ...rest } = settings;
  return rest;
}
