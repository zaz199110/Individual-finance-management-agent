import { createClient } from "@supabase/supabase-js";
import { probeOpenAICompatible } from "@/lib/config/model-providers";
import { testAkShareConnectivity } from "@/lib/l0/akshare-client";
import { testTushareToken } from "@/lib/l0/tushare-client";
import { bootstrapSettingsFromEnv } from "@/lib/settings/bootstrap-from-env";
import {
  buildModelProbeConfig,
} from "@/lib/settings/model-probe";
import {
  getPublicDatabaseSettings,
  resolveDatabaseCredentials,
  updateDatabaseCheck,
} from "@/lib/settings/database";
import {
  getPublicDataSourceSettings,
  resolveTushareToken,
  updateDataSourceCheck,
} from "@/lib/settings/datasources";
import {
  getRawModelSettings,
  getSupabase,
  type ModelSettingsRow,
  type ModelSlot,
} from "@/lib/supabase/server";
import type { CheckStatus } from "@/lib/supabase/server";

const ALL_MODEL_SLOTS: ModelSlot[] = [
  "reasoning",
  "deep",
  "vision",
  "web",
  "embedding",
];

let probeInFlight: Promise<AutoProbeSummary> | null = null;

export interface AutoProbeSummary {
  seeded: string[];
  probed: string[];
  skipped: string[];
  passed: string[];
  failed: string[];
}

function hasModelCredentials(row: ModelSettingsRow): boolean {
  return Boolean(
    row.api_base_url?.trim() && row.api_key_encrypted?.trim(),
  );
}

async function probeAndPersistModelSlot(
  slot: ModelSlot,
  row: ModelSettingsRow,
): Promise<CheckStatus> {
  const cfg = buildModelProbeConfig(slot, row);
  if (!cfg) return "failed";

  const { ok, message } = await probeOpenAICompatible(cfg);
  const status: CheckStatus = ok ? "passed" : "failed";
  const now = new Date().toISOString();

  const supabase = await getSupabase();
  if (supabase) {
    await supabase
      .from("model_settings")
      .update({
        model_name: cfg.model_name,
        api_base_url: cfg.api_base_url,
        api_key_encrypted: cfg.api_key,
        use_same_as_reasoning: false,
        check_status: status,
        last_checked_at: now,
        last_error_message: ok ? null : message,
        updated_at: now,
      })
      .eq("slot", slot);
  }

  return status;
}

async function probeAndPersistDatabase(
  options?: { force?: boolean },
): Promise<CheckStatus | null> {
  const pub = await getPublicDatabaseSettings();
  if (!options?.force && pub.check_status === "passed") {
    return "passed";
  }

  const creds = await resolveDatabaseCredentials();
  if (!creds?.supabase_url || !creds.anon_key) return null;

  try {
    const client = createClient(creds.supabase_url, creds.anon_key, {
      auth: { persistSession: false },
    });
    const { error } = await client.from("conversations").select("id").limit(1);
    if (error && !error.message.includes("does not exist")) {
      await updateDatabaseCheck({
        status: "failed",
        error_message: error.message,
      });
      return "failed";
    }
    await updateDatabaseCheck({ status: "passed", error_message: null });
    return "passed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "连接失败";
    await updateDatabaseCheck({ status: "failed", error_message: message });
    return "failed";
  }
}

async function probeAndPersistTushare(
  options?: { force?: boolean },
): Promise<CheckStatus | null> {
  const pub = await getPublicDataSourceSettings();
  if (!pub.tushare_token_masked) return null;
  if (!options?.force && pub.tushare_check_status === "passed") {
    return "passed";
  }

  const token = await resolveTushareToken();
  if (!token) return null;

  try {
    await testTushareToken(token);
    await updateDataSourceCheck({ provider: "tushare", status: "passed" });
    return "passed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tushare 检测失败";
    await updateDataSourceCheck({
      provider: "tushare",
      status: "failed",
      error_message: message,
    });
    return "failed";
  }
}

async function probeAndPersistAkshare(
  options?: { force?: boolean },
): Promise<CheckStatus> {
  const pub = await getPublicDataSourceSettings();
  if (!options?.force && pub.akshare_check_status === "passed") {
    return "passed";
  }

  try {
    await testAkShareConnectivity();
    await updateDataSourceCheck({ provider: "akshare", status: "passed" });
    return "passed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "AKShare 暂不可用";
    await updateDataSourceCheck({
      provider: "akshare",
      status: "failed",
      error_message: message,
    });
    return "failed";
  }
}

async function runStartupSettingsProbe(
  options?: { force?: boolean },
): Promise<AutoProbeSummary> {
  const summary: AutoProbeSummary = {
    seeded: [],
    probed: [],
    skipped: [],
    passed: [],
    failed: [],
  };

  const { seeded } = await bootstrapSettingsFromEnv();
  summary.seeded.push(...seeded);

  const rows = await getRawModelSettings();

  const modelProbeJobs: Array<{
    slot: ModelSlot;
    row: ModelSettingsRow;
  }> = [];

  for (const slot of ALL_MODEL_SLOTS) {
    const row = rows.find((r) => r.slot === slot);
    if (!row || !hasModelCredentials(row)) {
      summary.skipped.push(`model:${slot}`);
      continue;
    }
    if (!options?.force && row.check_status === "passed") {
      summary.skipped.push(`model:${slot}`);
      summary.passed.push(`model:${slot}`);
      continue;
    }
    modelProbeJobs.push({ slot, row });
  }

  if (modelProbeJobs.length > 0) {
    summary.probed.push(...modelProbeJobs.map(({ slot }) => `model:${slot}`));
    const modelResults = await Promise.all(
      modelProbeJobs.map(async ({ slot, row }) => ({
        slot,
        status: await probeAndPersistModelSlot(slot, row),
      })),
    );
    for (const { slot, status } of modelResults) {
      if (status === "passed") summary.passed.push(`model:${slot}`);
      else summary.failed.push(`model:${slot}`);
    }
  }

  summary.probed.push("database", "datasource:tushare", "datasource:akshare");
  const [dbStatus, tsStatus, akStatus] = await Promise.all([
    probeAndPersistDatabase(options),
    probeAndPersistTushare(options),
    probeAndPersistAkshare(options),
  ]);
  if (dbStatus === "passed") summary.passed.push("database");
  else if (dbStatus === "failed") summary.failed.push("database");
  else summary.skipped.push("database");

  if (tsStatus === "passed") summary.passed.push("datasource:tushare");
  else if (tsStatus === "failed") summary.failed.push("datasource:tushare");
  else summary.skipped.push("datasource:tushare");

  if (akStatus === "passed") summary.passed.push("datasource:akshare");
  else summary.failed.push("datasource:akshare");

  return summary;
}

/** 打开客户端时：读配置表 → 全量检测 → 结果落库（非页面刷新） */
export async function ensureEnvDefaultsProbed(
  options?: { force?: boolean },
): Promise<AutoProbeSummary> {
  if (probeInFlight) return probeInFlight;

  probeInFlight = runStartupSettingsProbe(options).finally(() => {
    probeInFlight = null;
  });

  return probeInFlight;
}

/** @deprecated 检测结果已写入配置表，直接读 check_status 即可 */
export function applySessionProbeToModelRows<T extends ModelSettingsRow>(
  rows: T[],
): T[] {
  return rows;
}
