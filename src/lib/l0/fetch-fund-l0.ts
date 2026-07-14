import {
  formatL0Summary,
  getFundL0Profile,
  type FundL0Profile,
} from "@/harness/infra/fund_knowledge/l0-registry";
import { readCachedFundL0 } from "@/lib/l0/l0-sync";
import { fetchFundL0FromAkShare } from "@/lib/l0/akshare-client";
import { fetchFundL0FromTushare } from "@/lib/l0/tushare-client";
import type { L0FundSnapshot, LookupSource } from "@/lib/l0/types";
import { resolveTushareToken } from "@/lib/settings/datasources";
import { supplementSnapshotFromWeb } from "@/lib/l0/web-fallback";

/** 仅合并注册表中的 archetype 元数据，不补持仓/净值假数 */
function mergeWithRegistry(
  snapshot: L0FundSnapshot,
  registry: FundL0Profile | null,
): L0FundSnapshot {
  if (!registry) return { ...snapshot, l0_degraded: false };

  return {
    ...snapshot,
    fund_name: snapshot.fund_name || registry.fund_name,
    fund_type: snapshot.fund_type || registry.fund_type,
    risk_level: snapshot.risk_level || registry.risk_level,
    is_qdii: snapshot.is_qdii ?? registry.is_qdii,
    is_index: snapshot.is_index ?? /指数/i.test(registry.fund_type),
    l0_degraded: false,
  };
}

export interface FetchLiveFundL0Options {
  /** 跳过 l0-cache，直拉 Tushare → AKShare（持仓 report gather 用） */
  skipCache?: boolean;
}

export async function fetchLiveFundL0(
  fundCode: string,
  options?: FetchLiveFundL0Options,
): Promise<L0FundSnapshot | null> {
  const registry = getFundL0Profile(fundCode);
  if (!options?.skipCache) {
    const cached = readCachedFundL0(fundCode);
    if (cached) {
      return supplementSnapshotFromWeb(mergeWithRegistry(cached, registry));
    }
  }

  const token = await resolveTushareToken();

  if (token) {
    try {
      const fromTushare = await fetchFundL0FromTushare(fundCode, token);
      if (fromTushare) {
        return supplementSnapshotFromWeb(
          mergeWithRegistry(fromTushare, registry),
        );
      }
    } catch {
      /* fall through to akshare */
    }
  }

  try {
    const fromAk = await fetchFundL0FromAkShare(fundCode);
    if (fromAk) {
      return supplementSnapshotFromWeb(mergeWithRegistry(fromAk, registry));
    }
  } catch {
    /* no live data */
  }

  return null;
}

export function formatL0SnapshotSummary(
  snapshot: L0FundSnapshot,
  hasVault: boolean,
): string {
  const profile: FundL0Profile = {
    fund_code: snapshot.fund_code,
    fund_name: snapshot.fund_name,
    fund_type: snapshot.fund_type,
    risk_level: snapshot.risk_level ?? "—",
    summary:
      snapshot.lookup_source === "tushare"
        ? "行情来自 Tushare（结构化 L0）。"
        : "行情来自 AKShare 等价公开接口（备用 L0）。",
    archetype: getFundL0Profile(snapshot.fund_code)?.archetype ?? "C",
    has_vault: hasVault,
    is_qdii: snapshot.is_qdii,
    nav_date: snapshot.metrics?.as_of_trade_date,
    nav: snapshot.metrics?.nav,
    return_1y_pct: snapshot.metrics?.return_1y_pct,
    max_drawdown_1y_pct: snapshot.metrics?.max_drawdown_1y_pct,
  };

  const base = formatL0Summary(profile);
  const sourceLine =
    snapshot.lookup_source === "tushare"
      ? "数据来源：Tushare"
      : "数据来源：AKShare（备用）";
  return `${base}\n${sourceLine}`;
}

export { formatL0Summary };
