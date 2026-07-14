import fs from "node:fs";
import path from "node:path";
import { fetchLiveFundL0 } from "@/lib/l0/fetch-fund-l0";
import { fetchFundDividendsLightweight } from "@/lib/l0/eastmoney-client";
import type { L0FundSnapshot } from "@/lib/l0/types";
import { getDataDir } from "@/lib/paths";
import { getSupabase } from "@/lib/supabase/server";
import { getFundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";
import { buildWebFallbackSnapshot, supplementSnapshotFromWeb } from "@/lib/l0/web-fallback";
import {
  getSeedFundKnowledgeRoot,
} from "@/harness/infra/fund_knowledge/paths";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
} from "@/lib/fund-knowledge/vault-dir";

export interface L0SyncLogEntry {
  fund_code: string;
  synced_at: string;
  lookup_source?: string;
  ok: boolean;
  error?: string;
}

function cacheDir(): string {
  return path.join(getDataDir(), "l0-cache");
}

function cachePath(fundCode: string): string {
  return path.join(cacheDir(), `${fundCode}.json`);
}

function logPath(): string {
  return path.join(getDataDir(), "l0-sync-log.jsonl");
}

/** Detect garbled / mojibake fund names (same logic as watchlist.ts). */
function isLikelyGarbled(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (name.includes("\uFFFD")) return true;
  const cjkCount = (name.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  return cjkCount < 2;
}

function shouldRefetchForDividendHistory(snapshot: L0FundSnapshot): boolean {
  // 货币基金不依赖 dividend_history
  if (/货币/i.test(snapshot.fund_type ?? "")) return false;
  // web_fallback / registry_demo 等降级源不强制刷新
  if (snapshot.lookup_source === "web_fallback" || snapshot.lookup_source === "registry_demo") return false;
  // 缺少 dividend_history 字段或为空数组说明是旧缓存/拉取失败，需要刷新
  return snapshot.dividend_history === undefined || !snapshot.dividend_history.length;
}

function appendLogFile(entry: L0SyncLogEntry): void {
  const dir = path.dirname(logPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath(), `${JSON.stringify(entry)}\n`, "utf8");
}

/** Best-effort write to Supabase l0_sync_log (non-fatal if DB unavailable). */
export async function appendL0SyncLogDb(entry: L0SyncLogEntry): Promise<void> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("l0_sync_log").insert({
      fund_code: entry.fund_code,
      synced_at: entry.synced_at,
      lookup_source: entry.lookup_source ?? null,
      ok: entry.ok,
      error: entry.error ?? null,
    });
    if (error) {
      console.warn("[l0-sync] Supabase log insert failed:", error.message);
    }
  } catch (e) {
    console.warn(
      "[l0-sync] Supabase log insert error:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

async function appendLog(entry: L0SyncLogEntry): Promise<void> {
  appendLogFile(entry);
  await appendL0SyncLogDb(entry);
}

export interface SyncFundL0LocalOptions {
  /** 忽略已有 cache，强制拉最新 L0 并覆盖本地缓存（PORT-L0-GATHER-01） */
  force?: boolean;
}

/** 按需 sync 单只基金 L0 到本地 JSON 缓存（验收：KB + L0 均已同步） */
export async function syncFundL0Local(
  fundCode: string,
  options?: SyncFundL0LocalOptions,
): Promise<{
  ok: boolean;
  snapshot?: L0FundSnapshot;
  synced_at?: string;
  error?: string;
}> {
  const synced_at = new Date().toISOString();
  try {
    let snapshot = await fetchLiveFundL0(fundCode, {
      skipCache: options?.force === true,
    });

    // 自动刷新：非货币基金且 L0 快照缺少 dividend_history 字段时，使用轻量分红函数补拉
    if (snapshot && shouldRefetchForDividendHistory(snapshot)) {
      const dividends = await fetchFundDividendsLightweight(fundCode, snapshot.fund_name);
      if (dividends.length > 0) {
        snapshot = { ...snapshot, dividend_history: dividends };
      }
    }

    if (!snapshot) {
      // Try web fallback as last resort
      const webSnapshot = await buildWebFallbackSnapshot(fundCode, fundCode);
      if (webSnapshot) {
        // Write web-fallback cache just like a normal snapshot
        const dir = cacheDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          cachePath(fundCode),
          JSON.stringify({ synced_at, snapshot: webSnapshot }, null, 2),
          "utf8",
        );
        await appendLog({
          fund_code: fundCode,
          synced_at,
          ok: true,
          lookup_source: webSnapshot.lookup_source,
        });
        return { ok: true, snapshot: webSnapshot, synced_at };
      }
      const error = `未获取到 ${fundCode} 的 L0 数据（Tushare / AKShare / 联网搜索均失败）。`;
      await appendLog({ fund_code: fundCode, synced_at, ok: false, error });
      return { ok: false, error };
    }
    const dir = cacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cachePath(fundCode),
      JSON.stringify({ synced_at, snapshot }, null, 2),
      "utf8",
    );
    await appendLog({
      fund_code: fundCode,
      synced_at,
      ok: true,
      lookup_source: snapshot.lookup_source,
    });
    return { ok: true, snapshot, synced_at };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await appendLog({ fund_code: fundCode, synced_at, ok: false, error });
    return { ok: false, error };
  }
}

/** 调 Tushare 拉取 L0 → 本地缓存 + Supabase fund_watchlist 落库 */
export async function syncFundL0AndDb(fundCode: string): Promise<{
  ok: boolean;
  fund_name?: string;
  fund_code?: string;
  error?: string;
}> {
  const result = await syncFundL0Local(fundCode);
  if (!result.ok) return result;

  let fundName = result.snapshot!.fund_name;

  // If the API returned a garbled name, fall back to the local registry
  if (isLikelyGarbled(fundName)) {
    const registry = getFundL0Profile(fundCode);
    if (registry?.fund_name && !isLikelyGarbled(registry.fund_name)) {
      fundName = registry.fund_name;
    } else {
      fundName = fundCode;
    }
  }

  const snapshot = result.snapshot
    ? await supplementSnapshotFromWeb(result.snapshot)
    : null;

  try {
    const supabase = await getSupabase();
    if (supabase) {
      const { data: existing } = await supabase
        .from("fund_watchlist")
        .select("id")
        .eq("fund_code", fundCode)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("fund_watchlist")
          .update({
            fund_name: fundName,
            l0_snapshot: snapshot ?? null,
            last_analysis_at: new Date().toISOString(),
          })
          .eq("fund_code", fundCode);
      } else {
        await supabase
          .from("fund_watchlist")
          .insert({
            fund_code: fundCode,
            fund_name: fundName,
            added_at: new Date().toISOString(),
            l0_snapshot: snapshot ?? null,
          });
      }
    }
  } catch (e) {
    console.warn(
      "[l0-sync] fund_watchlist sync error:",
      e instanceof Error ? e.message : String(e),
    );
  }

  return { ok: true, fund_name: fundName, fund_code: fundCode };
}

export function readCachedFundL0(fundCode: string): L0FundSnapshot | null {
  const p = cachePath(fundCode);
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as { snapshot?: L0FundSnapshot };
    return json.snapshot ?? null;
  } catch {
    return null;
  }
}

export function isFundL0SyncedToday(fundCode: string): boolean {
  const p = cachePath(fundCode);
  if (!fs.existsSync(p)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8")) as { synced_at?: string };
    if (!json.synced_at) return false;
    const day = json.synced_at.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return day === today;
  } catch {
    return false;
  }
}

/** 读取 Supabase 中某基金最近一次同步记录（验收 / system-verify） */
export async function readLatestL0SyncLogDb(fundCode: string): Promise<{
  ok: boolean;
  row?: {
    fund_code: string;
    synced_at: string;
    lookup_source: string | null;
    ok: boolean;
    error: string | null;
  };
  error?: string;
}> {
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, error: "无 Supabase 连接" };
  }
  const { data, error } = await supabase
    .from("l0_sync_log")
    .select("fund_code, synced_at, lookup_source, ok, error")
    .eq("fund_code", fundCode)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "无同步记录" };
  }
  return { ok: true, row: data };
}

// ── L0 完整性 & 时效性检查 ──────────────────────────────────────────

/** 判断 L0 快照是否包含足够核心字段（非退化、非空、非乱码）。 */
export function isL0SnapshotComplete(snapshot: L0FundSnapshot): boolean {
  if (!snapshot) return false;
  if (snapshot.l0_degraded) return false;
  if (snapshot.lookup_source !== "tushare" && snapshot.lookup_source !== "akshare") {
    return false;
  }
  if (isLikelyGarbled(snapshot.fund_name)) return false;
  if (!snapshot.fund_type) return false;
  if (!snapshot.benchmark_name) return false;
  if (!snapshot.metrics) return false;
  if (typeof snapshot.metrics.nav !== "number") return false;
  if (!snapshot.metrics.as_of_trade_date) return false;
  return true;
}

/** 判断某基金 L0 是否需要重新同步：
 *  - 无缓存 → 需要
 *  - 缓存不完整 → 需要（强制）
 *  - 缓存完整但不是今日更新 → 需要
 *  - 其他 → 不需要
 */
export function needsL0Sync(fundCode: string): { needed: boolean; reason: string } {
  const cached = readCachedFundL0(fundCode);
  if (!cached) {
    return { needed: true, reason: "no_cache" };
  }
  if (!isL0SnapshotComplete(cached)) {
    return { needed: true, reason: "incomplete" };
  }
  if (!isFundL0SyncedToday(fundCode)) {
    return { needed: true, reason: "stale" };
  }
  return { needed: false, reason: "ok" };
}

// ── Seed 基金批量 L0 同步 ───────────────────────────────────────────

/** 返回种子知识库中所有基金代码（去重）。 */
export function seedFundCodes(): string[] {
  const seedRoot = getSeedFundKnowledgeRoot();
  if (!fs.existsSync(seedRoot)) return [];
  const dirs = fs.readdirSync(seedRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isVaultFundDir(d.name));
  const codes = new Set<string>();
  for (const d of dirs) {
    const code = parseFundCodeFromVaultDir(d.name);
    if (code) codes.add(code);
  }
  return [...codes];
}

export interface SeedFundSyncReport {
  fund_code: string;
  status: "synced" | "skipped" | "failed";
  reason: string;
  fund_name?: string;
  error?: string;
}

/** 对种子知识库中所有基金检查并补全 L0 缓存。
 *  - 无缓存 / 不完整 / 过时 → 触发 syncFundL0AndDb
 *  - 其他 → 跳过
 * 返回逐基金报告。 */
export async function ensureSeedFundsL0Synced(
  options?: { force?: boolean },
): Promise<SeedFundSyncReport[]> {
  const codes = seedFundCodes();
  console.log(`[l0-sync] 种子基金数量：${codes.length}，代码：${codes.join(", ")}`);
  const reports: SeedFundSyncReport[] = [];

  for (const fundCode of codes) {
    // force 模式直接同步，否则先判断是否需要
    if (!options?.force) {
      const check = needsL0Sync(fundCode);
      if (!check.needed) {
        reports.push({
          fund_code: fundCode,
          status: "skipped",
          reason: check.reason,
        });
        continue;
      }
    }

    try {
      const result = await syncFundL0AndDb(fundCode);
      reports.push({
        fund_code: fundCode,
        status: result.ok ? "synced" : "failed",
        reason: result.ok ? "ok" : (result.error ?? "unknown"),
        fund_name: result.fund_name,
        error: result.error,
      });
    } catch (e) {
      reports.push({
        fund_code: fundCode,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const synced = reports.filter((r) => r.status === "synced");
  const skipped = reports.filter((r) => r.status === "skipped");
  const failed = reports.filter((r) => r.status === "failed");
  console.log(
    `[l0-sync] 种子基金 L0 同步完成：${synced.length} 只同步，${skipped.length} 只跳过，${failed.length} 只失败`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.warn(`[l0-sync] ${f.fund_code} 失败：${f.reason}`);
    }
  }

  return reports;
}
