import type { FundLookupResult } from "@/lib/fund/lookup";
import type { GatherPurpose, L0GapKind } from "@/lib/kb/l0-gaps";
import { gapRelevantToIntent } from "@/lib/kb/l0-gaps";

/** KB-03 intent routing · PRD §9.2.0g */
export type KbIntent =
  | "nav"
  | "performance"
  | "holdings"
  | "disclosure"
  | "colloquial"
  | "news"
  | "general";

export type KbPrimaryLayer = "L0" | "L1" | "L2" | "L3";

export function classifyKbIntent(query: string): KbIntent {
  const q = query.trim();
  if (/最新|新闻|舆情|消息|报道|资讯|最近有什么|近期/.test(q)) return "news";
  if (/稳不稳|贵不贵|适合谁|适合什么人|怎么样|好不好|值得买|能买吗|定投吗/.test(q)) {
    return "colloquial";
  }
  if (/净值|单位净值|多少钱|现价/.test(q)) return "nav";
  if (/持仓|重仓|买了什么|前十大|持股/.test(q)) return "holdings";
  if (/业绩|收益|回报|回撤|涨跌|表现/.test(q)) return "performance";
  if (/费率|管理费|托管费|投资范围|风险揭示|披露|招募|概要/.test(q)) return "disclosure";
  return "general";
}

export function primaryLayerForIntent(intent: KbIntent): KbPrimaryLayer {
  switch (intent) {
    case "nav":
    case "performance":
    case "holdings":
      return "L0";
    case "disclosure":
    case "general":
      return "L1";
    case "colloquial":
      return "L2";
    case "news":
      return "L3";
  }
}

/** L0 有效 = fund_lookup 含本题所需字段组 */
export function isL0ValidForIntent(
  lookup: Pick<
    FundLookupResult,
    | "ok"
    | "nav"
    | "as_of_trade_date"
    | "return_1y_pct"
    | "max_drawdown_1y_pct"
    | "top_holdings"
  >,
  intent: KbIntent,
): boolean {
  if (!lookup.ok) return false;
  switch (intent) {
    case "nav":
      return lookup.nav != null && Boolean(lookup.as_of_trade_date);
    case "performance":
      return (
        lookup.return_1y_pct != null || lookup.max_drawdown_1y_pct != null
      );
    case "holdings":
      return (lookup.top_holdings?.length ?? 0) > 0;
    default:
      return lookup.nav != null && Boolean(lookup.as_of_trade_date);
  }
}

export function wantsExplicitNews(query: string): boolean {
  return /最新资讯|舆情|新闻|最近消息|公开资讯|媒体报道/.test(query.trim());
}

/** KB-03 L3 触发 · FK-CITE-NOVAULT-01 补充 */
export function shouldInvokeL3(input: {
  intent: KbIntent;
  query: string;
  hasVault: boolean;
  l0Valid: boolean;
  l1Valid: boolean;
  l2Valid: boolean;
  skipL3?: boolean;
  purpose?: GatherPurpose;
  l0Gaps?: L0GapKind[];
  l0Degraded?: boolean;
  needsDisclosureL3?: boolean;
}): boolean {
  if (input.skipL3) return false;
  if (wantsExplicitNews(input.query) || input.intent === "news") return true;

  const gaps = input.l0Gaps ?? [];
  const purpose = input.purpose ?? "qa";

  if (purpose === "full_report") {
    if (input.needsDisclosureL3) return true;
    if (gaps.length > 0) return true;
    if (input.l0Degraded) return true;
    return false;
  }

  if (!input.hasVault) {
    if (input.intent === "nav" || input.intent === "performance" || input.intent === "holdings") {
      return gaps.some((g) => gapRelevantToIntent(g, input.intent)) || !input.l0Valid;
    }
    if (input.intent === "disclosure" || input.intent === "general") return true;
    if (input.intent === "colloquial") return !input.l2Valid;
    return !input.l0Valid;
  }

  if (gaps.some((g) => gapRelevantToIntent(g, input.intent))) return true;

  if (input.intent === "colloquial") {
    if (input.l1Valid) return false;
    if (input.l2Valid) return false;
    return true;
  }

  const primary = primaryLayerForIntent(input.intent);
  if (primary === "L0" && input.l0Valid) return false;
  if (primary === "L1" && input.l1Valid) return false;
  if (primary === "L2") {
    if (input.l1Valid) return false;
    if (input.l2Valid) return false;
    return true;
  }

  if (primary === "L0" && !input.l0Valid) return true;
  if (primary === "L1" && !input.l1Valid) return true;

  return false;
}

/** L2 命中后带 hint 收敛 L1 */
export function buildL1HintsFromL2(metadata?: {
  keywords?: string[];
  suggested_doc_types?: string[];
}): string[] {
  const hints: string[] = [];
  for (const kw of metadata?.keywords ?? []) {
    hints.push(kw);
  }
  for (const dt of metadata?.suggested_doc_types ?? []) {
    hints.push(dt === "prospectus" ? "费率 风险 投资范围" : dt.replace(/_/g, " "));
  }
  return [...new Set(hints)].slice(0, 4);
}
