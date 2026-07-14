import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { resolveProviderStack } from "@/lib/config/model-providers";
import {
  mergeModelSettingsWithEnv,
  stripModelConfigSource,
  type ModelSettingsRowWithSource,
} from "@/lib/settings/env-defaults";
import { resolveDatabaseCredentials } from "@/lib/settings/database";

export type ModelSlot = "reasoning" | "deep" | "vision" | "web" | "embedding";
export type CheckStatus = "unchecked" | "checking" | "passed" | "failed";

export interface ModelSettingsRow {
  slot: ModelSlot;
  model_name: string | null;
  api_base_url: string | null;
  api_key_encrypted: string | null;
  use_same_as_reasoning: boolean;
  check_status: CheckStatus;
  last_checked_at: string | null;
  last_error_message: string | null;
}

/** ensureModelSlot 返回值：已校验 api_base_url 和 api_key_encrypted 非空 */
export interface ActiveModelSettingsRow extends ModelSettingsRow {
  api_base_url: string;
  api_key_encrypted: string;
}

export interface DatabaseSettings {
  supabase_url: string;
  anon_key: string;
  service_role_key?: string;
  db_password?: string;
  check_status: CheckStatus;
  last_checked_at?: string | null;
  last_error_message?: string | null;
}

function getEnvSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

let cachedSupabase: SupabaseClient | null | undefined;
let cachedSupabaseKey = "";

function buildSupabaseCacheKey(
  creds: Awaited<ReturnType<typeof resolveDatabaseCredentials>>,
): string {
  if (!creds) return "env";
  return `${creds.supabase_url}:${creds.service_role_key ?? creds.anon_key}`;
}

/** 数据库设置变更后调用，避免每个 API 重复解析凭证并创建 client */
export function invalidateSupabaseCache(): void {
  cachedSupabase = undefined;
  cachedSupabaseKey = "";
}

export async function getSupabase(): Promise<SupabaseClient | null> {
  const creds = await resolveDatabaseCredentials();
  const cacheKey = buildSupabaseCacheKey(creds);
  if (cachedSupabase !== undefined && cachedSupabaseKey === cacheKey) {
    return cachedSupabase;
  }

  let client: SupabaseClient | null;
  if (creds) {
    const key = creds.service_role_key ?? creds.anon_key;
    client = createClient(creds.supabase_url, key, {
      auth: { persistSession: false },
    });
  } else {
    client = getEnvSupabase();
  }

  cachedSupabase = client;
  cachedSupabaseKey = cacheKey;
  return client;
}

function defaultEmptyModelRows(): ModelSettingsRow[] {
  const slots: ModelSlot[] = [
    "reasoning",
    "deep",
    "vision",
    "web",
    "embedding",
  ];
  return slots.map((slot) => ({
    slot,
    model_name: null,
    api_base_url: null,
    api_key_encrypted: null,
    use_same_as_reasoning: slot === "deep" || slot === "vision",
    check_status: "unchecked" as CheckStatus,
    last_checked_at: null,
    last_error_message: null,
  }));
}

/** 仅从数据库读取，不含 .env.local 回落 */
export async function getRawModelSettings(): Promise<ModelSettingsRow[]> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from("model_settings").select("*");
    if (!error && data?.length) {
      return data as ModelSettingsRow[];
    }
  }
  return defaultEmptyModelRows();
}

/** 有效配置：已保存优先，否则 .env.local 默认值 */
export async function getModelSettings(): Promise<ModelSettingsRow[]> {
  const raw = await getRawModelSettings();
  return mergeModelSettingsWithEnv(raw).map(stripModelConfigSource);
}

export async function getPublicModelSettings(): Promise<
  ModelSettingsRowWithSource[]
> {
  const raw = await getRawModelSettings();
  return raw.map((row) => ({
    ...row,
    config_source: (row.api_key_encrypted?.trim()
      ? "saved"
      : "env") as ModelSettingsRowWithSource["config_source"],
  }));
}

export async function getDatabaseSettings(): Promise<DatabaseSettings | null> {
  const creds = await resolveDatabaseCredentials();
  if (!creds) return null;
  return {
    supabase_url: creds.supabase_url,
    anon_key: creds.anon_key,
    service_role_key: creds.service_role_key,
    db_password: creds.db_password,
    check_status: creds.check_status,
    last_checked_at: creds.last_checked_at ?? null,
    last_error_message: creds.last_error_message ?? null,
  };
}

export async function resolveModelSlot(
  slot: ModelSlot,
  rows?: ModelSettingsRow[],
): Promise<ModelSettingsRow | null> {
  const settings = rows ?? (await getModelSettings());
  const row = settings.find((r) => r.slot === slot);
  if (!row) {
    const stack = resolveProviderStack();
    const cfg = stack[slot];
    if (!cfg) return null;
    return {
      slot,
      model_name: cfg.model_name,
      api_base_url: cfg.api_base_url,
      api_key_encrypted: cfg.api_key,
      use_same_as_reasoning: slot === "deep" || slot === "vision",
      check_status: "unchecked",
      last_checked_at: null,
      last_error_message: null,
    };
  }

  if (row.use_same_as_reasoning && slot !== "reasoning") {
    const reasoning = settings.find((r) => r.slot === "reasoning");
    if (!reasoning) return row;
    const inheritsCredentials = Boolean(
      reasoning.model_name?.trim() || reasoning.api_key_encrypted?.trim(),
    );
    if (!inheritsCredentials) return row;
    return {
      ...row,
      model_name: reasoning.model_name,
      api_base_url: reasoning.api_base_url,
      api_key_encrypted: reasoning.api_key_encrypted,
      check_status: row.check_status,
    };
  }
  return row;
}

/** 自动探测模型槽位：如果已通过直接返回，否则先探测再存档。
 *  所有需要 LLM 的调用方应优先用此函数替代 resolveModelSlot +
 *  手动 check_status 判断，避免因 env var 未存档导致反复拒绝。 */
export async function ensureModelSlot(
  slot: ModelSlot,
): Promise<ActiveModelSettingsRow | null> {
  const row = await resolveModelSlot(slot);
  if (!row?.api_base_url?.trim() || !row.api_key_encrypted?.trim()) return null;

  // 已通过探测，直接返回
  if (row.check_status === "passed") return row as ActiveModelSettingsRow;

  // 自动探测
  const { buildModelProbeConfig } = await import(
    "@/lib/settings/model-probe"
  );
  const cfg = buildModelProbeConfig(slot, row);
  if (!cfg) return null;

  const { probeOpenAICompatible } = await import(
    "@/lib/config/model-providers"
  );
  const { ok, message } = await probeOpenAICompatible(cfg);

  // 存档结果，下次调用直接命中 passed 快速路径
  const supabase = await getSupabase();
  if (supabase) {
    await supabase.from("model_settings").upsert(
      {
        slot,
        model_name: cfg.model_name,
        api_base_url: cfg.api_base_url,
        api_key_encrypted: cfg.api_key,
        check_status: ok ? "passed" : "failed",
        last_checked_at: new Date().toISOString(),
        last_error_message: ok ? null : message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slot" },
    );
  }

  if (!ok) return null;

  // 返回探测通过的配置
  return {
    ...row,
    check_status: "passed",
    last_checked_at: new Date().toISOString(),
  } as ActiveModelSettingsRow;
}
