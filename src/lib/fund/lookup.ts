import {
  FUND_L0_REGISTRY,
  getFundL0Profile,
} from "@/harness/infra/fund_knowledge/l0-registry";
import { ensureFundKnowledgeVault } from "@/harness/infra/fund_knowledge/bootstrap";
import { getFundKnowledgeRoot, listVaultFundCodes } from "@/harness/infra/fund_knowledge/paths";
import { resolveVaultRiskLevel } from "@/harness/infra/fund_knowledge/vault-disclosure";
import { shouldEnrichFundKnowledge, enrichFundKnowledgeVault } from "@/harness/infra/fund_knowledge/enrich";
import {
  fetchLiveFundL0,
  formatL0SnapshotSummary,
} from "@/lib/l0/fetch-fund-l0";
import {
  appendWebFallbackToSummary,
  isLiveL0Source,
  supplementL0FromWeb,
} from "@/lib/l0/web-fallback";
import { fetchFundBasicInfoXq } from "@/lib/l0/xueqiu-client";
import { needsL0Sync, syncFundL0Local, seedFundCodes } from "@/lib/l0/l0-sync";
import type { LookupSource, L0DividendRecord, L0TopHolding } from "@/lib/l0/types";
import type { HoldingsKind, L0AssetAllocation, L0HolderStructure } from "@/lib/l0/registry-portfolio";
import { inferHoldingsKind } from "@/lib/l0/registry-portfolio";

export interface FundLookupResult {
  ok: boolean;
  fund_code?: string;
  fund_name?: string;
  fund_type?: string;
  risk_level?: string;
  summary?: string;
  has_vault?: boolean;
  archetype?: string;
  lookup_source?: LookupSource;
  l0_degraded?: boolean;
  as_of_trade_date?: string;
  nav?: number;
  nav_acc?: number;
  return_1y_pct?: number;
  max_drawdown_1y_pct?: number;
  is_qdii?: boolean;
  is_index?: boolean;
  top_holdings?: L0TopHolding[];
  top_holdings_concentration?: number;
  holdings_as_of?: string;
  holdings_kind?: HoldingsKind;
  asset_allocation?: L0AssetAllocation;
  holder_structure?: L0HolderStructure;
  /** live = Tushare/AKShare；registry_demo = 演示注册表补全（仅当 live 无持仓） */
  holdings_source?: "live" | "registry_demo";
  fund_managers?: import("@/lib/l0/types").L0FundManagerRecord[];
  fund_share?: import("@/lib/l0/types").L0FundShareSnapshot;
  benchmark_name?: string;
  benchmark_index_code?: string;
  benchmark_return_1y_pct?: number;
  excess_return_1y_pct?: number;
  /** L0 费率（优先于 L1 解析） */
  l0_fee_rates?: import("@/lib/kb/disclosure-parse").ParsedFeeRates;
  /** 雪球基金交易规则（赎回费等） */
  fee_rules_xq?: import("@/lib/l0/types").FundFeeRule[];
  /** 天天基金网-行业配置 */
  industry_allocation?: import("@/lib/l0/types").FundIndustryAllocation[];
  /** L0 分红记录 */
  dividend_history?: L0DividendRecord[];
  /** 基金成立日期 */
  found_date?: string;
  /** 最低申购金额（万元） */
  min_amount?: number;
  /** 预期收益率 */
  exp_return?: number;
  /** 投资风格（独立字段） */
  invest_type?: string;
  /** 基金类型标签（独立字段） */
  type_label?: string;
  /** 基金管理人 */
  management?: string;
  /** 基金托管人 */
  custodian?: string;
  /** 货币基金万份收益（元） */
  daily_income_per_10k?: number;
  /** 货币基金七日年化收益率（%） */
  yield_7d_annual?: number;
  error?: string;
}

export function resolveFundCode(text: string): string | null {
  const m = text.match(/\b(\d{6})\b/);
  return m?.[1] ?? null;
}

function resolveLookupRiskLevel(
  fundCode: string,
  hasVault: boolean,
  snapshotRisk?: string,
  registryRisk?: string,
): string | undefined {
  if (hasVault) {
    ensureFundKnowledgeVault();
    const vaultRisk = resolveVaultRiskLevel(getFundKnowledgeRoot(), fundCode);
    if (vaultRisk) return vaultRisk;
  }
  return snapshotRisk ?? registryRisk;
}

function vaultHasFund(fundCode: string): boolean {
  ensureFundKnowledgeVault();
  const vaultCodes = new Set(listVaultFundCodes(getFundKnowledgeRoot()));
  const profile = getFundL0Profile(fundCode);
  return Boolean(profile?.has_vault || vaultCodes.has(fundCode));
}

export async function fundLookupAsync(input: {
  fund_code?: string;
  query?: string;
}): Promise<FundLookupResult> {
  const code =
    String(input.fund_code ?? "").trim() ||
    (input.query ? resolveFundCode(input.query) : null);

  if (!code) {
    return { ok: false, error: "请提供 6 位基金代码。" };
  }

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "基金代码须为 6 位数字。" };
  }

  const snapshot = await fetchLiveFundL0(code);
  if (!snapshot) {
    return {
      ok: false,
      error: `L0：未获取到基金 ${code} 的行情与持仓（请检查 Tushare Token 与 AKShare 网络连接后重试同步）。`,
    };
  }

  const hasVault = vaultHasFund(code);
  const registry = getFundL0Profile(code);

  // 获取雪球基金基本信息（业绩比较基准等）
  let xqBasicInfo: Awaited<ReturnType<typeof fetchFundBasicInfoXq>> = null;
  try {
    xqBasicInfo = await fetchFundBasicInfoXq(code);
  } catch {
    // 雪球接口失败不影响主流程
  }

  let summary = formatL0SnapshotSummary(snapshot, hasVault);
  let l0Degraded = snapshot.l0_degraded ?? !isLiveL0Source(snapshot.lookup_source);

  if (!isLiveL0Source(snapshot.lookup_source)) {
    const web = await supplementL0FromWeb(
      code,
      snapshot.fund_name || registry?.fund_name || code,
    );
    if (web) {
      summary = appendWebFallbackToSummary(summary, web);
      l0Degraded = true;
    }
  }

  // ── 后台 L0 / L1 自动补全（仅对种子基金，非阻塞） ──────────
  const seedCodes = new Set(seedFundCodes());
  const isSeedFund = seedCodes.has(code);

  if (isSeedFund && process.env.HARNESS_SKIP_ENRICH !== "1") {
    // L0 检查：不完整或过时则后台同步
    const l0Check = needsL0Sync(code);
    if (l0Check.needed) {
      syncFundL0Local(code, { force: l0Check.reason === "incomplete" }).catch((e) => {
        console.warn(`[lookup] 后台 L0 同步失败 ${code}:`, e);
      });
    }
    // L1 检查：不满足最低披露标准则后台补全
    if (shouldEnrichFundKnowledge(code)) {
      enrichFundKnowledgeVault({
        fundCode: code,
        fundName: snapshot.fund_name || registry?.fund_name || code,
        fundType: snapshot.fund_type,
        riskLevel: snapshot.risk_level,
      }).catch((e) => {
        console.warn(`[lookup] 后台 L1 富化失败 ${code}:`, e);
      });
    }
  }

  return {
    ok: true,
    fund_code: code,
    fund_name: snapshot.fund_name,
    fund_type: snapshot.fund_type,
    risk_level: resolveLookupRiskLevel(
      code,
      hasVault,
      snapshot.risk_level,
      registry?.risk_level,
    ),
    summary,
    has_vault: hasVault,
    archetype: registry?.archetype ?? "C",
    lookup_source: snapshot.lookup_source,
    l0_degraded: l0Degraded,
    as_of_trade_date: snapshot.metrics?.as_of_trade_date,
    nav: snapshot.metrics?.nav,
    nav_acc: snapshot.metrics?.nav_acc,
    return_1y_pct: snapshot.metrics?.return_1y_pct,
    max_drawdown_1y_pct: snapshot.metrics?.max_drawdown_1y_pct,
    is_qdii: snapshot.is_qdii,
    is_index: snapshot.is_index,
    top_holdings: snapshot.top_holdings,
    top_holdings_concentration: snapshot.top_holdings_concentration,
    holdings_as_of: snapshot.holdings_as_of,
    holdings_kind: inferHoldingsKind(
      registry?.archetype ?? "C",
      snapshot.fund_type,
    ),
    asset_allocation: snapshot.asset_allocation,
    holder_structure: undefined,
    holdings_source: snapshot.holdings_source,
    fund_managers: snapshot.fund_managers,
    fund_share: snapshot.fund_share,
    benchmark_name: xqBasicInfo?.benchmark ?? snapshot.benchmark_name,
    benchmark_index_code: snapshot.benchmark_index_code,
    benchmark_return_1y_pct: snapshot.benchmark_return_1y_pct,
    excess_return_1y_pct: snapshot.excess_return_1y_pct,
    l0_fee_rates: snapshot.fee_rates,
    fee_rules_xq: snapshot.fee_rules_xq,
    industry_allocation: snapshot.industry_allocation,
    dividend_history: snapshot.dividend_history,
    found_date: snapshot.found_date,
    min_amount: snapshot.min_amount,
    exp_return: snapshot.exp_return,
    invest_type: snapshot.invest_type,
    type_label: snapshot.type_label,
    management: xqBasicInfo?.fund_company ?? snapshot.management,
    custodian: xqBasicInfo?.custody_bank ?? snapshot.custodian,
    daily_income_per_10k: snapshot.metrics?.daily_income_per_10k,
    yield_7d_annual: snapshot.metrics?.yield_7d_annual,
  };
}

/** Sync registry-only lookup (tests / offline). */
export function fundLookup(input: {
  fund_code?: string;
  query?: string;
}): FundLookupResult {
  const code =
    String(input.fund_code ?? "").trim() ||
    (input.query ? resolveFundCode(input.query) : null);

  if (!code) {
    return { ok: false, error: "请提供 6 位基金代码。" };
  }

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "基金代码须为 6 位数字。" };
  }

  const profile = getFundL0Profile(code);
  if (!profile) {
    return {
      ok: false,
      error: `L0：未收录基金 ${code}（演示可用 019305、017704、206007、110020 等）。`,
    };
  }

  const hasVault = vaultHasFund(code);
  return {
    ok: true,
    fund_code: code,
    fund_name: profile.fund_name,
    fund_type: profile.fund_type,
    risk_level: resolveLookupRiskLevel(code, hasVault, undefined, profile.risk_level),
    summary: formatL0SnapshotSummary(
      {
        fund_code: code,
        fund_name: profile.fund_name,
        fund_type: profile.fund_type,
        risk_level: resolveLookupRiskLevel(code, hasVault, undefined, profile.risk_level),
        lookup_source: "registry_demo",
        l0_degraded: true,
        metrics: profile.nav_date
          ? {
              as_of_trade_date: profile.nav_date,
              nav: profile.nav,
              return_1y_pct: profile.return_1y_pct,
              max_drawdown_1y_pct: profile.max_drawdown_1y_pct,
            }
          : undefined,
      },
      hasVault,
    ),
    has_vault: hasVault,
    archetype: profile.archetype,
    lookup_source: "registry_demo",
    l0_degraded: true,
    as_of_trade_date: profile.nav_date,
    nav: profile.nav,
    return_1y_pct: profile.return_1y_pct,
    max_drawdown_1y_pct: profile.max_drawdown_1y_pct,
    is_qdii: profile.is_qdii,
    is_index: /指数/i.test(profile.fund_type),
    holdings_kind: inferHoldingsKind(profile.archetype, profile.fund_type),
  };
}

export const DEMO_FUND_CODE = "019305";

export { FUND_L0_REGISTRY, getFundL0Profile };
