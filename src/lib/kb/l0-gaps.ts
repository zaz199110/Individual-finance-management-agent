import type { FundLookupResult } from "@/lib/fund/lookup";

export type L0GapKind = "identity" | "nav" | "performance" | "holdings";

export type GatherPurpose = "full_report" | "qa";

const HOLDINGS_ARCHETYPES = new Set(["A", "B", "D", "E", "F"]);

export function archetypeNeedsHoldingsChart(archetype: string): boolean {
  return HOLDINGS_ARCHETYPES.has(archetype);
}

export function isL0Degraded(
  lookup: Pick<FundLookupResult, "l0_degraded" | "lookup_source">,
): boolean {
  return Boolean(
    lookup.l0_degraded ||
      lookup.lookup_source === "registry_demo" ||
      lookup.lookup_source === "web_fallback",
  );
}

export function getL0Gaps(
  lookup: Pick<
    FundLookupResult,
    | "ok"
    | "fund_name"
    | "fund_type"
    | "risk_level"
    | "nav"
    | "as_of_trade_date"
    | "return_1y_pct"
    | "max_drawdown_1y_pct"
    | "top_holdings"
  >,
  purpose: GatherPurpose,
  archetype: string,
): L0GapKind[] {
  if (!lookup.ok) return ["identity", "nav", "performance"];

  const gaps: L0GapKind[] = [];

  if (!lookup.fund_name?.trim() || !lookup.fund_type?.trim() || !lookup.risk_level?.trim()) {
    gaps.push("identity");
  }
  if (lookup.nav == null || !lookup.as_of_trade_date) {
    gaps.push("nav");
  }

  if (purpose === "full_report") {
    if (lookup.return_1y_pct == null || lookup.max_drawdown_1y_pct == null) {
      gaps.push("performance");
    }
    if (
      archetypeNeedsHoldingsChart(archetype) &&
      (lookup.top_holdings?.length ?? 0) === 0 &&
      !/货币/.test(lookup.fund_type ?? "")
    ) {
      gaps.push("holdings");
    }
  } else {
    // qa: gap sets resolved by intent in shouldInvokeL3ForGap
    if (lookup.return_1y_pct == null && lookup.max_drawdown_1y_pct == null) {
      gaps.push("performance");
    }
  }

  return [...new Set(gaps)];
}

export function gapRelevantToIntent(gap: L0GapKind, intent: string): boolean {
  switch (intent) {
    case "nav":
      return gap === "nav";
    case "performance":
      return gap === "performance";
    case "holdings":
      return gap === "holdings";
    default:
      return true;
  }
}
