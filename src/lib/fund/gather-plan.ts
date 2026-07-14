import { getFundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";
import { shouldEnrichFundKnowledge } from "@/harness/infra/fund_knowledge/enrich";
import type { FundLookupResult } from "@/lib/fund/lookup";
import { getL0Gaps, isL0Degraded } from "@/lib/kb/l0-gaps";

/** 完整报告是否会走 FK-ENRICH-01 知识库预热 */
export function predictFullReportNeedsEnrich(
  lookup: Pick<FundLookupResult, "ok" | "fund_code">,
): boolean {
  if (!lookup.ok || !lookup.fund_code) return false;
  return shouldEnrichFundKnowledge(lookup.fund_code);
}

/** 完整报告是否会走 KB-03 L3 联网（与 waterfall shouldInvokeL3 full_report 分支对齐） */
export function predictFullReportNeedsL3(
  lookup: Pick<
    FundLookupResult,
    | "ok"
    | "has_vault"
    | "fund_code"
    | "fund_name"
    | "fund_type"
    | "risk_level"
    | "nav"
    | "as_of_trade_date"
    | "return_1y_pct"
    | "max_drawdown_1y_pct"
    | "top_holdings"
    | "l0_degraded"
    | "lookup_source"
  >,
): boolean {
  if (!lookup.ok || !lookup.fund_code) return false;
  if (process.env.HARNESS_SKIP_L3 === "1") return false;

  const profile = getFundL0Profile(lookup.fund_code);
  const l0Gaps = getL0Gaps(lookup, "full_report", profile?.archetype ?? "D");

  if (!lookup.has_vault) return true;
  if (l0Gaps.length > 0) return true;
  if (isL0Degraded(lookup)) return true;
  return false;
}
