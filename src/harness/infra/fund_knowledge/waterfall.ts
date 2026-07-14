import { webSearch } from "@/harness/tools/web_search";
import type { WebSearchCitation } from "@/harness/tools/web_search.types";
import { fundLookupAsync, type FundLookupResult } from "@/lib/fund/lookup";
import {
  buildGatherFailureMessage,
  buildL3FailureMessage,
  extractAssetAllocationFromL1Hits,
  formatHoldingCostEstimate,
  hasCompleteCoreFees,
  isDisclosurePlaceholder,
  mergeFeeRates,
  parseFeeRatesFromSnippets,
  pickBestExcerpt,
  type ParsedFeeRates,
} from "@/lib/kb/disclosure-parse";
import type { L0AssetAllocation } from "@/lib/l0/registry-portfolio";
import {
  buildL1HintsFromL2,
  classifyKbIntent,
  isL0ValidForIntent,
  shouldInvokeL3,
} from "@/lib/kb/kb-intent";
import {
  archetypeNeedsHoldingsChart,
  type GatherPurpose,
  getL0Gaps,
  isL0Degraded,
  type L0GapKind,
} from "@/lib/kb/l0-gaps";
import { isL2Valid, isL3Valid } from "@/lib/kb/kb-valid";
import { exploreFundKnowledgeAsync, type ExploreHit } from "./explore";
import { formatL0Summary, getFundL0Profile } from "./l0-registry";
import { semanticSearchFundKnowledgeAsync } from "./semantic";
import type { WorkflowTaskStatus } from "@/lib/chat/task-progress";

export type GatherStageHook = (stage: {
  task_key: string;
  status: WorkflowTaskStatus;
}) => void | Promise<void>;

export interface WaterfallGatherOptions {
  skip_l3?: boolean;
  skip_l2?: boolean;
  query?: string;
  purpose?: GatherPurpose;
  /** 完整报告 L3 联网起止时回调，供进度条 fund.gather.l3 */
  onStage?: GatherStageHook;
}

export interface WaterfallGatherResult {
  ok: boolean;
  fund_code: string;
  intent: string;
  purpose: GatherPurpose;
  l0_summary: string;
  l0_valid: boolean;
  l0_gaps: L0GapKind[];
  l0_degraded: boolean;
  l1_hits: ExploreHit[];
  l1_valid: boolean;
  l2_preview: string;
  l2_valid: boolean;
  l3_citations: WebSearchCitation[];
  l3_summary: string;
  l3_valid: boolean;
  l3_skipped: boolean;
  fee_excerpt: string;
  scope_excerpt: string;
  risk_excerpt: string;
  fee_source_as_of?: string;
  scope_source_as_of?: string;
  risk_source_as_of?: string;
  holdings_excerpt: string;
  has_structured_holdings: boolean;
  skip_holdings_chart: boolean;
  parsed_fees: ParsedFeeRates;
  holding_cost_estimate: string;
  /** L1 季报「资产组合」解析 · ASSET-01 */
  asset_allocation?: L0AssetAllocation;
  novault_disclaimer: string;
  citations_footnotes: string;
  error?: string;
}

const L1_QUERIES = [
  "投资范围 费率",
  "管理费 托管费",
  "风险揭示",
  "投资目标 策略",
  "业绩比较基准",
  "资产组合 季报",
  "分红政策",
  "申购赎回",
  "基金托管人",
];

interface L3Task {
  id: string;
  query: string;
}

interface L3TaskResult {
  id: string;
  ok: boolean;
  summary: string;
  snippet_texts: string[];
  citations: WebSearchCitation[];
  error?: string;
}

function l1DisclosureComplete(hits: ExploreHit[]): boolean {
  const fee = hits.some((h) => /费率|费用|管理/.test(h.heading + h.excerpt));
  const scope = hits.some((h) => /投资范围|产品概况|标的/.test(h.heading + h.excerpt));
  const risk = hits.some((h) => /风险/.test(h.heading + h.excerpt));
  return fee && scope && risk;
}

function buildFullReportL3Tasks(input: {
  fundCode: string;
  fundName: string;
  needsDisclosureL3: boolean;
  l0Gaps: L0GapKind[];
  l0Degraded: boolean;
}): L3Task[] {
  const tasks: L3Task[] = [];
  const { fundCode, fundName } = input;

  if (input.needsDisclosureL3) {
    tasks.push(
      { id: "fee", query: `${fundName} ${fundCode} 管理费 托管费 申购费` },
      { id: "scope", query: `${fundName} ${fundCode} 投资范围 产品资料概要` },
      { id: "risk", query: `${fundName} ${fundCode} 风险揭示 风险等级` },
    );
  }

  if (input.l0Gaps.includes("holdings")) {
    tasks.push({
      id: "holdings",
      query: `${fundName} ${fundCode} 前十大重仓 行业配置 季报`,
    });
  }
  if (input.l0Gaps.includes("nav")) {
    tasks.push({
      id: "nav",
      query: `${fundName} ${fundCode} 单位净值 最新`,
    });
  }
  if (input.l0Gaps.includes("performance")) {
    tasks.push({
      id: "performance",
      query: `${fundName} ${fundCode} 近一年收益 最大回撤`,
    });
  }
  if (input.l0Degraded) {
    tasks.push({
      id: "refresh",
      query: `${fundName} ${fundCode} 基金 最新 概况`,
    });
  }

  const seen = new Set<string>();
  return tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

async function runL3Task(task: L3Task): Promise<L3TaskResult> {
  try {
    const ws = await webSearch({ query: task.query, max_results: 5 });
    const valid = isL3Valid(ws.citations.length, ws.l3_low_confidence ?? false);
    const snippet_texts = ws.snippets ?? [];
    return {
      id: task.id,
      ok: valid,
      summary: ws.summary.slice(0, 1200),
      snippet_texts,
      citations: ws.citations,
      error: valid ? undefined : "检索结果置信度不足或未返回可用引用",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "联网搜索请求失败";
    return {
      id: task.id,
      ok: false,
      summary: "",
      snippet_texts: [],
      citations: [],
      error: msg,
    };
  }
}

async function recoverMissingCoreFees(input: {
  fundCode: string;
  fundName: string;
  hasVault: boolean;
  l1Hits: ExploreHit[];
  parsed: ParsedFeeRates;
}): Promise<ParsedFeeRates> {
  if (hasCompleteCoreFees(input.parsed)) return input.parsed;

  let fees = mergeFeeRates(
    input.parsed,
    parseFeeRatesFromSnippets(input.l1Hits.map((h) => h.excerpt)),
  );
  if (hasCompleteCoreFees(fees)) return fees;

  if (input.hasVault) {
    const ex = await exploreFundKnowledgeAsync({
      fund_code: input.fundCode,
      query: "管理费 托管费 年费率 基金运作相关费用",
      max_hits: 12,
    });
    fees = mergeFeeRates(
      fees,
      parseFeeRatesFromSnippets(ex.hits.map((h) => h.excerpt)),
    );
    if (hasCompleteCoreFees(fees)) return fees;
  }

  try {
    const ws = await webSearch({
      query: `${input.fundName} ${input.fundCode} 管理费率 托管费率 基金产品资料概要`,
      max_results: 8,
    });
    fees = mergeFeeRates(
      fees,
      parseFeeRatesFromSnippets([ws.summary, ...(ws.snippets ?? [])]),
    );
  } catch {
    /* 补全失败时沿用已有 partial 结果，由 mandatory 校验给出对客提示 */
  }

  return fees;
}

function mergeCitations(
  existing: WebSearchCitation[],
  incoming: WebSearchCitation[],
  max = 5,
): WebSearchCitation[] {
  const out = [...existing];
  const urls = new Set(existing.map((c) => c.url));
  for (const c of incoming) {
    if (urls.has(c.url)) continue;
    urls.add(c.url);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

function validateFullReportMandatory(input: {
  needsDisclosureL3: boolean;
  fee_excerpt: string;
  scope_excerpt: string;
  risk_excerpt: string;
  l0Gaps: L0GapKind[];
  holdings_excerpt: string;
  parsed_fees: ParsedFeeRates;
  l3TaskResults: L3TaskResult[];
  l0Degraded: boolean;
  invokeL3: boolean;
  hasVault: boolean;
}): string | null {
  if (input.needsDisclosureL3 && !input.invokeL3) {
    return buildL3FailureMessage("缺少入库披露且未触发联网补全");
  }

  if (input.invokeL3) {
    for (const r of input.l3TaskResults) {
      if (!r.ok) {
        return buildL3FailureMessage(r.error ?? `任务 ${r.id} 未返回可用结果`);
      }
    }
  }

  if (input.needsDisclosureL3) {
    if (isDisclosurePlaceholder(input.fee_excerpt)) {
      return buildL3FailureMessage("未能从联网检索提取费率条款");
    }
    if (isDisclosurePlaceholder(input.scope_excerpt)) {
      return buildL3FailureMessage("未能从联网检索提取投资范围");
    }
    if (isDisclosurePlaceholder(input.risk_excerpt)) {
      return buildL3FailureMessage("未能从联网检索提取风险揭示摘要");
    }
  } else if (input.hasVault) {
    if (isDisclosurePlaceholder(input.fee_excerpt)) {
      return buildL3FailureMessage("入库披露未命中费率章节");
    }
    if (isDisclosurePlaceholder(input.scope_excerpt)) {
      return buildL3FailureMessage("入库披露未命中投资范围");
    }
    if (isDisclosurePlaceholder(input.risk_excerpt)) {
      return buildL3FailureMessage("入库披露未命中风险揭示");
    }
  }

  if (!hasCompleteCoreFees(input.parsed_fees)) {
    if (input.hasVault && !input.needsDisclosureL3) {
      return buildGatherFailureMessage("未能从本地知识库解析管理费与托管费", "l1");
    }
    return buildGatherFailureMessage("未能解析管理费与托管费", "parse");
  }

  if (input.l0Gaps.includes("holdings")) {
    if (input.invokeL3 && !input.holdings_excerpt.trim()) {
      return buildL3FailureMessage("未能从联网检索获取持仓/行业配置说明");
    }
    if (!input.invokeL3 && !input.holdings_excerpt.trim()) {
      return buildL3FailureMessage("缺少结构化重仓且未触发联网补全");
    }
  }

  if (
    input.l0Degraded &&
    input.invokeL3 &&
    !input.l3TaskResults.some((r) => r.id === "refresh" && r.ok)
  ) {
    return buildL3FailureMessage("行情降级数据需联网刷新但未成功");
  }

  return null;
}

export async function gatherFundWaterfall(
  fundCode: string,
  options?: WaterfallGatherOptions,
): Promise<WaterfallGatherResult> {
  const purpose = options?.purpose ?? "qa";
  const profile = getFundL0Profile(fundCode);
  const query = options?.query?.trim() || `${profile?.fund_name ?? fundCode} 基金解读`;
  const intent = classifyKbIntent(query);
  const archetype = profile?.archetype ?? "D";

  const lookup = await fundLookupAsync({ fund_code: fundCode });
  if (!lookup.ok) {
    return emptyResult(fundCode, intent, purpose, lookup.error);
  }

  const l0_degraded = isL0Degraded(lookup);
  const l0_gaps = getL0Gaps(lookup, purpose, archetype);
  const l0_valid = isL0ValidForIntent(lookup, intent);
  const hasVault = Boolean(lookup.has_vault);
  const l0FeeRates = lookup.l0_fee_rates ?? {};
  const has_structured_holdings = (lookup.top_holdings?.length ?? 0) > 0;
  const skip_holdings_chart =
    purpose === "full_report" &&
    archetypeNeedsHoldingsChart(archetype) &&
    !has_structured_holdings;

  const l0_summary = formatL0Summary({
    fund_code: fundCode,
    fund_name: lookup.fund_name ?? profile?.fund_name ?? fundCode,
    fund_type: lookup.fund_type ?? profile?.fund_type ?? "",
    risk_level: lookup.risk_level ?? profile?.risk_level ?? "",
    summary: lookup.summary ?? profile?.summary ?? "",
    archetype: (profile?.archetype ?? archetype) as import("./l0-registry").FundL0Profile["archetype"],
    has_vault: hasVault,
    is_qdii: lookup.is_qdii ?? profile?.is_qdii,
    nav_date: lookup.as_of_trade_date,
    nav: lookup.nav,
    return_1y_pct: lookup.return_1y_pct,
    max_drawdown_1y_pct: lookup.max_drawdown_1y_pct,
  });

  const l1HitsMap = new Map<string, ExploreHit>();
  let l1_valid = false;

  if (hasVault) {
    for (const q of L1_QUERIES) {
      const ex = await exploreFundKnowledgeAsync({
        fund_code: fundCode,
        query: q,
        max_hits: 4,
      });
      if (!ex.low_confidence && ex.hits.length) l1_valid = true;
      for (const hit of ex.hits) {
        if (!l1HitsMap.has(hit.chunk_id)) l1HitsMap.set(hit.chunk_id, hit);
      }
    }
  }

  const shouldSkipL2 = options?.skip_l2 ?? process.env.HARNESS_SKIP_L2 === "1";
  const l2 = shouldSkipL2
    ? { ok: true, fund_code: fundCode, query, hits: [], low_confidence: true, preview: "" }
    : await semanticSearchFundKnowledgeAsync({
        fund_code: fundCode,
        query,
        max_hits: 5,
      });
  const l2_valid = isL2Valid(l2.low_confidence);

  if (hasVault && l2.top_metadata && (l2_valid || intent === "colloquial")) {
    const hints = buildL1HintsFromL2(l2.top_metadata);
    for (const hint of hints.slice(0, 2)) {
      const ex = await exploreFundKnowledgeAsync({
        fund_code: fundCode,
        query: hint,
        max_hits: 2,
      });
      if (!ex.low_confidence && ex.hits.length) l1_valid = true;
      for (const hit of ex.hits) {
        if (!l1HitsMap.has(hit.chunk_id)) l1HitsMap.set(hit.chunk_id, hit);
      }
    }
  }

  const l1_hits = [...l1HitsMap.values()].slice(0, 12);
  const needsDisclosureL3 = !hasVault || !l1DisclosureComplete(l1_hits);

  const skipL3 =
    options?.skip_l3 === true || process.env.HARNESS_SKIP_L3 === "1";

  const invokeL3 = shouldInvokeL3({
    intent,
    query,
    hasVault,
    l0Valid: l0_valid,
    l1Valid: l1_valid,
    l2Valid: l2_valid,
    skipL3,
    purpose,
    l0Gaps: l0_gaps,
    l0Degraded: l0_degraded,
    needsDisclosureL3,
  });

  let l3_citations: WebSearchCitation[] = [];
  let l3_summary = "";
  let l3_valid = false;
  const l3TaskResults: L3TaskResult[] = [];

  const feeSnippets = l1_hits
    .filter((h) => /费率|费用|管理|托管/.test(h.heading + h.excerpt))
    .map((h) => h.excerpt);
  let fee_excerpt = pickBestExcerpt(feeSnippets);
  let scope_excerpt = pickFromL1(l1_hits, /投资范围|产品概况|标的/);
  let risk_excerpt = pickFromL1(l1_hits, /风险/);
  let fee_source_as_of = pickSourceAsOfFromL1(
    l1_hits,
    /费率|费用|管理|托管/,
  );
  let scope_source_as_of = pickSourceAsOfFromL1(
    l1_hits,
    /投资范围|产品概况|标的/,
  );
  let risk_source_as_of = pickSourceAsOfFromL1(l1_hits, /风险/);
  let holdings_excerpt = "";
  let parsed_fees = parseFeeRatesFromSnippets([
    ...feeSnippets,
    ...l1_hits.map((h) => h.excerpt),
  ]);

  if (invokeL3) {
    try {
      await options?.onStage?.({ task_key: "fund.gather.l3", status: "running" });

      const tasks =
        purpose === "full_report"
          ? buildFullReportL3Tasks({
              fundCode,
              fundName: lookup.fund_name ?? fundCode,
              needsDisclosureL3,
              l0Gaps: l0_gaps,
              l0Degraded: l0_degraded,
            })
          : [{ id: "qa", query: `${lookup.fund_name ?? fundCode} ${fundCode} 基金 ${query}` }];

      for (const task of tasks) {
        const result = await runL3Task(task);
        l3TaskResults.push(result);
        if (result.citations.length) {
          l3_citations = mergeCitations(l3_citations, result.citations);
        }
        if (result.summary) {
          l3_summary = l3_summary
            ? `${l3_summary}\n\n${result.summary}`
            : result.summary;
        }

        if (task.id === "fee" && result.ok) {
          fee_excerpt = pickBestExcerpt([result.summary, ...result.snippet_texts, fee_excerpt]);
          parsed_fees = mergeFeeRates(
            parsed_fees,
            parseFeeRatesFromSnippets([result.summary, ...result.snippet_texts]),
          );
        }
        if (task.id === "scope" && result.ok) {
          scope_excerpt = pickBestExcerpt([result.summary, scope_excerpt]);
        }
        if (task.id === "risk" && result.ok) {
          risk_excerpt = pickBestExcerpt([result.summary, risk_excerpt]);
        }
        if (task.id === "holdings" && result.ok) {
          holdings_excerpt = pickBestExcerpt([result.summary]);
        }
      }

      l3_summary = l3_summary.slice(0, 1600);
      l3_valid = isL3Valid(l3_citations.length, false);
      parsed_fees = mergeFeeRates(
        parsed_fees,
        parseFeeRatesFromSnippets([
          l3_summary,
          ...l3TaskResults.flatMap((r) => [r.summary, ...r.snippet_texts]),
        ]),
      );

      await options?.onStage?.({ task_key: "fund.gather.l3", status: "done" });
    } catch (error) {
      await options?.onStage?.({ task_key: "fund.gather.l3", status: "failed" });
      throw error;
    }
  }

  if (purpose === "full_report") {
    parsed_fees = await recoverMissingCoreFees({
      fundCode,
      fundName: lookup.fund_name ?? fundCode,
      hasVault,
      l1Hits: l1_hits,
      parsed: parsed_fees,
    });
    if (!fee_excerpt && hasCompleteCoreFees(parsed_fees)) {
      fee_excerpt = pickBestExcerpt(feeSnippets);
    }

    parsed_fees = mergeFeeRates(parsed_fees, l0FeeRates);

    const mandatoryError = validateFullReportMandatory({
      needsDisclosureL3,
      fee_excerpt,
      scope_excerpt,
      risk_excerpt,
      l0Gaps: l0_gaps,
      holdings_excerpt,
      parsed_fees,
      l3TaskResults,
      l0Degraded: l0_degraded,
      invokeL3,
      hasVault,
    });

    if (mandatoryError) {
      return {
        ...partialResult(
          fundCode,
          intent,
          purpose,
          l0_summary,
          l0_valid,
          l0_gaps,
          l0_degraded,
          l1_hits,
          l1_valid,
          l2.preview,
          l2_valid,
          has_structured_holdings,
          skip_holdings_chart,
        ),
        fee_excerpt,
        scope_excerpt,
        risk_excerpt,
        fee_source_as_of,
        scope_source_as_of,
        risk_source_as_of,
        holdings_excerpt,
        parsed_fees,
        holding_cost_estimate: formatHoldingCostEstimate(parsed_fees) ?? "",
        asset_allocation: extractAssetAllocationFromL1Hits(l1_hits) ?? undefined,
        l3_citations,
        l3_summary,
        l3_valid,
        l3_skipped: !invokeL3,
        ok: false,
        error: mandatoryError,
      };
    }
  }

  const novault_disclaimer = !hasVault
    ? "本基金 **暂未纳入** App 本地基金知识库；下列费率、投资范围等条款信息来自 **公开联网检索**，请以基金公司最新法律文件为准。"
    : "";

  parsed_fees = mergeFeeRates(parsed_fees, l0FeeRates);

  const holding_cost_estimate = formatHoldingCostEstimate(parsed_fees) ?? "";
  const asset_allocation = extractAssetAllocationFromL1Hits(l1_hits) ?? undefined;

  const footnotes: string[] = [];
  if (hasVault && l1_hits.length) {
    l1_hits.forEach((h, i) => {
      const asOf = h.source_as_of ? ` · 数据截止 ${h.source_as_of}` : "";
      footnotes.push(`[^${i + 1}] ${h.heading}${asOf} · [查看原文](${h.deep_link})`);
    });
  } else if (l3_citations.length) {
    l3_citations.forEach((c, i) => {
      footnotes.push(`[^${i + 1}] ${c.title} · [延伸阅读](${c.url})`);
    });
  }

  return {
    ok: true,
    fund_code: fundCode,
    intent,
    purpose,
    l0_summary,
    l0_valid,
    l0_gaps,
    l0_degraded,
    l1_hits,
    l1_valid,
    l2_preview: l2.preview,
    l2_valid,
    l3_citations,
    l3_summary,
    l3_valid,
    l3_skipped: !invokeL3,
    fee_excerpt: fee_excerpt || qaPlaceholder("fee"),
    scope_excerpt: scope_excerpt || qaPlaceholder("scope"),
    risk_excerpt: risk_excerpt || qaPlaceholder("risk"),
    fee_source_as_of,
    scope_source_as_of,
    risk_source_as_of,
    holdings_excerpt,
    has_structured_holdings,
    skip_holdings_chart,
    parsed_fees,
    holding_cost_estimate,
    asset_allocation,
    novault_disclaimer,
    citations_footnotes: footnotes.join("\n"),
  };
}

function pickFromL1(hits: ExploreHit[], pattern: RegExp): string {
  return pickBestExcerpt(
    hits
      .filter((h) => pattern.test(h.heading + h.excerpt))
      .map((h) => h.excerpt),
  );
}

function pickSourceAsOfFromL1(hits: ExploreHit[], pattern: RegExp): string | undefined {
  return hits.find(
    (h) => pattern.test(h.heading + h.excerpt) && h.source_as_of,
  )?.source_as_of;
}

function qaPlaceholder(kind: "fee" | "scope" | "risk"): string {
  if (kind === "fee") return "（请查阅招募说明书费率章节）";
  if (kind === "scope") return "（请查阅产品资料概要投资范围）";
  return "（请查阅风险揭示章节）";
}

function emptyResult(
  fundCode: string,
  intent: string,
  purpose: GatherPurpose,
  error?: string,
): WaterfallGatherResult {
  return {
    ok: false,
    fund_code: fundCode,
    intent,
    purpose,
    l0_summary: "",
    l0_valid: false,
    l0_gaps: [],
    l0_degraded: false,
    l1_hits: [],
    l1_valid: false,
    l2_preview: "",
    l2_valid: false,
    l3_citations: [],
    l3_summary: "",
    l3_valid: false,
    l3_skipped: true,
    fee_excerpt: "",
    scope_excerpt: "",
    risk_excerpt: "",
    fee_source_as_of: undefined,
    scope_source_as_of: undefined,
    risk_source_as_of: undefined,
    holdings_excerpt: "",
    has_structured_holdings: false,
    skip_holdings_chart: false,
    parsed_fees: {},
    holding_cost_estimate: "",
    asset_allocation: undefined,
    novault_disclaimer: "",
    citations_footnotes: "",
    error,
  };
}

function partialResult(
  fundCode: string,
  intent: string,
  purpose: GatherPurpose,
  l0_summary: string,
  l0_valid: boolean,
  l0_gaps: L0GapKind[],
  l0_degraded: boolean,
  l1_hits: ExploreHit[],
  l1_valid: boolean,
  l2_preview: string,
  l2_valid: boolean,
  has_structured_holdings: boolean,
  skip_holdings_chart: boolean,
): WaterfallGatherResult {
  return {
    ok: true,
    fund_code: fundCode,
    intent,
    purpose,
    l0_summary,
    l0_valid,
    l0_gaps,
    l0_degraded,
    l1_hits,
    l1_valid,
    l2_preview,
    l2_valid,
    l3_citations: [],
    l3_summary: "",
    l3_valid: false,
    l3_skipped: true,
    fee_excerpt: "",
    scope_excerpt: "",
    risk_excerpt: "",
    fee_source_as_of: undefined,
    scope_source_as_of: undefined,
    risk_source_as_of: undefined,
    holdings_excerpt: "",
    has_structured_holdings,
    skip_holdings_chart,
    parsed_fees: {},
    holding_cost_estimate: "",
    asset_allocation: undefined,
    novault_disclaimer: "",
    citations_footnotes: "",
  };
}
