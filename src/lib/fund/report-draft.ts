import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gatherFundWaterfall } from "@/harness/infra/fund_knowledge/waterfall";
import { fundKnowledgeDeepLink, getFundKnowledgeRoot, getSeedFundKnowledgeRoot } from "@/harness/infra/fund_knowledge/paths";
import { getFundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";
import { getProjectRoot } from "@/lib/paths";

import { writeDraftMeta } from "@/lib/reports/draft-meta";
import { getDraftReportPath } from "@/lib/reports/draft-path";
import { completeText } from "@/lib/llm/invoke";
import { ensureModelSlot } from "@/lib/supabase/server";
import { sanitizeCustomerFacingText } from "./customer-copy";

import { resolveAsOfTradeDate } from "@/lib/scheduled/calendar";
import { fundLookupAsync, type FundLookupResult } from "./lookup";
import { fetchAssetAllocationXq } from "@/lib/l0/xueqiu-client";


import { summarizeObjectiveWithLlm } from "./fund-report-synopsis";
import { buildKnowledgeCitations } from "./knowledge-citations";
import { buildMoneyMarketReportMarkdown } from "./templates/money-market.template";
import { buildStockFundReportMarkdown } from "./templates/stock-fund.template";
import { buildBondFundReportMarkdown } from "./templates/bond-fund.template";
import type { GatherStageHook } from "@/harness/infra/fund_knowledge/waterfall";
import { parseHolderStructureFromText, deriveReportDateAndLabel } from "@/lib/kb/disclosure-parse";
import { buildHolderPieChart, formatEchartsFence } from "@/lib/fund/echarts-skeleton";

export interface FundReportDraftResult {
  ok: boolean;
  draft_path?: string;
  report_name?: string;
  fund_code?: string;
  preview?: string;
  knowledge_citations?: import("./knowledge-citations").KnowledgeCitation[];
  /** LLM 总结后的投资范围一句话，供 refine 步骤使用 */
  objectiveExcerpt?: string;
  error?: string;
}

export async function draftFundReport(
  supabase: SupabaseClient | null,
  params: {
    fundCode: string;
    conversationId: string;
    runId: string;
    skip_l3?: boolean;
    onGatherStage?: GatherStageHook;
    /** gatherFundWaterfall 成功后、撰写草稿前回调，供进度条切换至 fund.rpt.draft.compose */
    onGatherComplete?: () => void | Promise<void>;
  },
): Promise<FundReportDraftResult> {
  const lookup = await fundLookupAsync({ fund_code: params.fundCode });
  if (!lookup.ok || !lookup.fund_code) {
    return { ok: false, error: lookup.error };
  }

  const profile = getFundL0Profile(params.fundCode);
  const gathered = await gatherFundWaterfall(params.fundCode, {
    skip_l3: params.skip_l3,
    purpose: "full_report",
    onStage: params.onGatherStage,
  });
  if (!gathered.ok) {
    return { ok: false, error: gathered.error };
  }

  await params.onGatherComplete?.();

  const today = new Date();
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const reportName = `${lookup.fund_code}-${lookup.fund_name?.slice(0, 12) ?? "基金"}-解读-${ymd}`;

  // ── 共享费率解析（模块级，货币/债券/股票管线共用）──
  function resolveFeeFallback(lookup: FundLookupResult, feeRates: typeof gathered.parsed_fees) {
    const result: { subscriptionMax?: string; purchaseMax?: string; redemptionMax?: string } = {};
    const subPct = feeRates?.subscription_max_pct ?? lookup.l0_fee_rates?.subscription_max_pct;
    if (subPct != null) result.subscriptionMax = `${subPct}%`;
    const buyRules = (lookup.fee_rules_xq ?? []).filter(r => r.kind === "买入" && r.fee > 0);
    if (buyRules.length > 0) {
      const maxFee = Math.max(...buyRules.map(r => r.fee));
      result.purchaseMax = `${maxFee.toFixed(2)}%`;
    }
    const redeemRules = (lookup.fee_rules_xq ?? []).filter(r => r.kind === "赎回" && r.fee > 0);
    if (redeemRules.length > 0) {
      const maxFee = Math.max(...redeemRules.map(r => r.fee));
      result.redemptionMax = `${maxFee.toFixed(2)}%`;
    }
    return result;
  }

  const archetype = profile?.archetype ?? "D";

  // ── 货币基金独立管线 ──
  const isMoneyMarket = (lookup.fund_type ?? "").includes("货币型");
  if (isMoneyMarket) {
    const g = gathered;
    const hasVault = Boolean(lookup.has_vault);

    // ── 引用（Ch8）──
    const dedupedByDoc = new Map<string, typeof g.l1_hits[0]>();
    for (const h of g.l1_hits) {
      if (
        (h.doc_type === "quarterly_report" || h.doc_type === "prospectus") &&
        !dedupedByDoc.has(h.file_path)
      ) {
        dedupedByDoc.set(h.file_path, h);
      }
    }
    // Ensure prospectus (for Ch3 scope) comes before quarterly_report (for Ch5 allocation)
    const orderedHits = [
      ...Array.from(dedupedByDoc.values()).filter((h) => h.doc_type === "prospectus"),
      ...Array.from(dedupedByDoc.values()).filter((h) => h.doc_type === "quarterly_report"),
    ];
    const citations = orderedHits
      .slice(0, 6)
      .map((h, i) => {
        const fileName = h.file_path.split("/").pop() ?? h.file_path;
        const nameNoExt = fileName.replace(/\.\w+$/, "");
        let docLabel: string;
        if (/^\d{4}Q\d+-quarterly-report$/.test(nameNoExt)) {
          docLabel = nameNoExt.replace(/-quarterly-report$/, "").replace(/(\d{4}Q\d)/, "$1") + " 季报";
        } else if (h.doc_type === "prospectus") {
          docLabel = "基金产品资料概要";
        } else {
          docLabel = nameNoExt;
        }
        return {
          ref: i + 1,
          fund_code: h.fund_code,
          file_path: h.file_path,
          heading: "",
          line_start: 1,
          chunk_id: "",
          doc_label: docLabel,
          deep_link: fundKnowledgeDeepLink({
            fundCode: h.fund_code,
            filePath: h.file_path,
          }),
          source_as_of: h.source_as_of,
        };
      });
    const referenceChapter = buildMMReferenceChapter(lookup.fund_code, hasVault);

    // ── 投资范围（Ch3）──
    const scopeExcerpt = g.scope_excerpt
      ? sanitizeCustomerFacingText(g.scope_excerpt).replace(/^## [^\n]*\n?/gm, "")
      : undefined;
    const scopeFootnote = hasVault && citations[0] ? "[^1]" : "";

    // ── 费率（Ch4）──
    const feeTable = buildMMFeeTable(g.parsed_fees);
    const feeExcerptSanitized = sanitizeCustomerFacingText(g.fee_excerpt).replace(
      /^## [^\n]*\n?/gm,
      "",
    );
    const feeExcerpt = formatMMExcerpt(
      feeExcerptSanitized,
      g.fee_source_as_of,
      hasVault && !isVaultPlaceholder(g.fee_excerpt),
    );
    const feeSectionBody = feeTable
      ? `${feeTable}\n\n${feeExcerpt}`
      : `${feeExcerpt}`;
    const novaultNote = g.novault_disclaimer
      ? `\n> ${sanitizeCustomerFacingText(g.novault_disclaimer)}\n`
      : "";

    // ── 资产配置（Ch5）──
    const assetAllocation = parseMMAssetAllocation(g.l1_hits, lookup.fund_code);
    // Ch5 资产配置来源为最新季报；使用 citations 中第二个引用（季报）
    if (assetAllocation && hasVault && citations.length >= 2) {
      assetAllocation.footnote = "[^2]";
    }

    // ── 组装 ──
    const navDate = await resolveAsOfTradeDate(ymd);

    const { markdown: finalMd } = buildMoneyMarketReportMarkdown({
      fundCode: lookup.fund_code,
      fundName: lookup.fund_name ?? lookup.fund_code,
      typeLabel: lookup.type_label ?? lookup.fund_type,
      riskLevel: lookup.risk_level ?? "—",
      aumYi: lookup.fund_share?.aum_yi,
      aumDate: lookup.fund_share?.trade_date,
      investType: lookup.invest_type,
      minAmount: lookup.min_amount,
      expReturn: lookup.exp_return,
      benchmarkName: lookup.benchmark_name,
      foundDate: lookup.found_date,
      dailyIncomePer10k: lookup.daily_income_per_10k,
      yield7dAnnual: lookup.yield_7d_annual,
      navDate,
      ymd,
      dateLabel,
      fundManagers: lookup.fund_managers,
      scopeExcerpt,
      scopeFootnote,
      feeSectionBody,
      novaultNote,
      assetAllocation,
      referenceChapter,
    });

    const filePath = getDraftReportPath(params.conversationId, params.runId);
    fs.writeFileSync(filePath, finalMd, "utf8");

    writeDraftMeta(filePath, {
      report_type: "fund",
      conversation_id: params.conversationId,
      run_id: params.runId,
      report_name: reportName,
      fund_code: lookup.fund_code,
      report_archetype: archetype,
      holdings_kind: lookup.holdings_kind ?? null,
      holdings_source: lookup.holdings_source ?? null,
      as_of_trade_date: lookup.as_of_trade_date ?? null,
      knowledge_citations: citations,
      skip_holdings_chart: gathered.skip_holdings_chart,
      echarts_count: assetAllocation?.items?.length ? 1 : 0,
    });

    if (supabase) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", params.conversationId)
        .maybeSingle();
      const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
      try {
        await supabase
          .from("conversations")
          .update({
            metadata: {
              ...meta,
              pending_report_draft: {
                report_type: "fund",
                fund_code: lookup.fund_code,
                file_path: filePath,
                report_name: reportName,
                run_id: params.runId,
                knowledge_citations: citations,
              },
              has_unconfirmed: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[draftFundReport] 会话元数据更新失败: ${msg}`);
        return {
          ok: false,
          error: `报告草稿已写入，但会话元数据更新失败：${msg}`,
          draft_path: filePath,
          report_name: reportName,
          fund_code: lookup.fund_code,
          preview: finalMd.slice(0, 800),
          knowledge_citations: citations,
          objectiveExcerpt: undefined,
        };
      }
    }

    return {
      ok: true,
      draft_path: filePath,
      report_name: reportName,
      fund_code: lookup.fund_code,
      preview: finalMd.slice(0, 800),
      knowledge_citations: citations,
      objectiveExcerpt: undefined,
    };
  }

  // ── 债券型基金独立管线 ──
  const isBondFund = (lookup.fund_type ?? "").includes("债券型");
  if (isBondFund) {
    const g = gathered;
    const hasVault = Boolean(lookup.has_vault);

    // ── 引用 ──
    const citations = buildKnowledgeCitations(g.l1_hits.slice(0, 6));
    const citeSection = buildMMReferenceChapter(lookup.fund_code, hasVault);
    const footnotesMarkdown = "";

    // ── 费率 ──
    const feeRates = g.parsed_fees;
    const feeFallback = resolveFeeFallback(lookup, feeRates);

    // ── 投资范围 ──
    const scopeExcerpt = g.scope_excerpt
      ? sanitizeCustomerFacingText(g.scope_excerpt).replace(/^## [^\n]*\n?/gm, "")
      : "";
    const scopeFootnote = hasVault && citations.length > 0 ? "[^1]" : "";

    // ── 经理 ──
    const managerSection = buildManagerSection(lookup.fund_managers);

    // ── 前五大持仓债券 ──
    function buildTop5BondHoldingsSection(
      holdings?: Array<{
        name: string;
        code?: string;
        asset_type: string;
        weight_pct?: number;
        market_value?: number;
      }>,
    ): string {
      if (!holdings?.length) return "";
      const bonds = holdings.filter((h) => h.asset_type === "bond").slice(0, 5);
      if (!bonds.length) return "";
      const rows = bonds.map((b) => {
        const name = b.name || "\u2014";
        const code = b.code ? ` (${b.code})` : "";
        const weight = b.weight_pct != null ? `**${b.weight_pct.toFixed(2)}%**` : "\u2014";
        const mv = b.market_value != null ? `${b.market_value.toFixed(2)} 万元` : "\u2014";
        return `| ${name}${code} | ${weight} | ${mv} |`;
      });
      return `| 债券名称 | 占净值比 | 市值（万元） |\n|----------|----------|-------------|\n${rows.join("\n")}`;
    }
    // ── vault 季报格式（发行主体 + 剩余期限，无代码/市值）──
    function buildVaultBondHoldingsSection(
      holdings: Array<{
        name: string;
        issuer: string;
        weight_pct: number;
        maturity: string;
      }>,
      asOfLabel: string,
    ): string {
      const rows = holdings.map((b) => {
        const name = b.name || "\u2014";
        const issuer = b.issuer || "\u2014";
        const weight = Number.isFinite(b.weight_pct) ? `**${b.weight_pct.toFixed(2)}%**` : "\u2014";
        const maturity = b.maturity || "\u2014";
        return `| ${name} | ${issuer} | ${weight} | ${maturity} |`;
      });
      return `| 债券名称 | 发行主体 | 占净值比 | 剩余期限 |\n|----------|---------|----------|----------|\n${rows.join("\n")}\n\n*数据来自 ${asOfLabel}*\n`;
    }

    const l0HoldingsSection = buildTop5BondHoldingsSection(lookup.top_holdings);
    let top5BondHoldingsSection = l0HoldingsSection;
    if (!l0HoldingsSection) {
      const vaultHoldings = parseBondTop5FromQuarterlyReports(lookup.fund_code);
      if (vaultHoldings) {
        top5BondHoldingsSection = buildVaultBondHoldingsSection(
          vaultHoldings.holdings,
          vaultHoldings.asOfLabel,
        );
      }
    }

    // ── 持有人结构 ──
    function buildHolderStructureSection(
      holder?: {
        as_of: string;
        as_of_label: string;
        individual_pct: number;
        institution_pct: number;
        internal_pct?: number;
      },
    ): string {
      if (!holder) return "";
      const rows = [
        `| 个人投资者 | **${holder.individual_pct.toFixed(2)}%** |`,
        `| 机构投资者 | **${holder.institution_pct.toFixed(2)}%** |`,
      ];
      if (holder.internal_pct != null) {
        rows.push(`| 内部持有 | **${holder.internal_pct.toFixed(2)}%** |`);
      }
      const table = `| 持有人类型 | 占比 |\n|------------|------|\n${rows.join("\n")}`;

      // 附加饼图（ECharts fence）
      const chartOption = buildHolderPieChart(holder);
      return `${table}\n\n${formatEchartsFence(chartOption)}`;
    }
    const holderData = lookup.holder_structure ?? readHolderStructureFromVault(lookup.fund_code);
    const holderStructureSection = buildHolderStructureSection(holderData);

    // ── 组装 ──
    const navDate = await resolveAsOfTradeDate(ymd);

    const { markdown: finalMd } = buildBondFundReportMarkdown({
      fundCode: lookup.fund_code ?? params.fundCode,
      fundName: lookup.fund_name ?? params.fundCode,
      fundType: lookup.fund_type ?? "\u2014",
      riskLevel: lookup.risk_level ?? "\u2014",
      navDate,
      ymd,
      dateLabel,
      benchmarkName: lookup.benchmark_name,
      return1yPct: lookup.return_1y_pct,
      maxDrawdown1yPct: lookup.max_drawdown_1y_pct,
      management: lookup.management,
      custodian: lookup.custodian,
      foundDate: lookup.found_date,
      minAmount: lookup.min_amount,
      expReturn: lookup.exp_return,
      aumYi: lookup.fund_share?.aum_yi,
      aumDate: lookup.fund_share?.trade_date,
      scopeExcerpt,
      scopeFootnote,
      managementFee: feeRates?.management_pct,
      custodyFee: feeRates?.custody_pct,
      subscriptionMax: feeFallback.subscriptionMax,
      purchaseMax: feeFallback.purchaseMax,
      redemptionMax: feeFallback.redemptionMax,
      salesServiceFee: feeRates?.sales_service_pct,
      managerSection,
      top5BondHoldingsSection,
      holderStructureSection,
      footnotesMarkdown,
      citeSection,
    });

    // ── 写入文件 ──
    const filePath = getDraftReportPath(params.conversationId, params.runId);
    fs.writeFileSync(filePath, finalMd, "utf8");

    writeDraftMeta(filePath, {
      report_type: "fund",
      conversation_id: params.conversationId,
      run_id: params.runId,
      report_name: reportName,
      fund_code: lookup.fund_code,
      report_archetype: archetype,
      holdings_kind: lookup.holdings_kind ?? null,
      holdings_source: lookup.holdings_source ?? null,
      as_of_trade_date: lookup.as_of_trade_date ?? null,
      knowledge_citations: citations,
      skip_holdings_chart: g.skip_holdings_chart,
      echarts_count: 0,
    });

    if (supabase) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", params.conversationId)
        .maybeSingle();
      const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
      try {
        await supabase
          .from("conversations")
          .update({
            metadata: {
              ...meta,
              pending_report_draft: {
                report_type: "fund",
                fund_code: lookup.fund_code,
                file_path: filePath,
                report_name: reportName,
                run_id: params.runId,
                knowledge_citations: citations,
              },
              has_unconfirmed: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[draftFundReport] \u4f1a\u8bdd\u5143\u6570\u636e\u66f4\u65b0\u5931\u8d25: ${msg}`);
        return {
          ok: false,
          error: `\u62a5\u544a\u8349\u7a3f\u5df2\u5199\u5165\uff0c\u4f46\u4f1a\u8bdd\u5143\u6570\u636e\u66f4\u65b0\u5931\u8d25\uff1a${msg}`,
          draft_path: filePath,
          report_name: reportName,
          fund_code: lookup.fund_code,
          preview: finalMd.slice(0, 800),
          knowledge_citations: citations,
          objectiveExcerpt: undefined,
        };
      }
    }

    return {
      ok: true,
      draft_path: filePath,
      report_name: reportName,
      fund_code: lookup.fund_code,
      preview: finalMd.slice(0, 800),
      knowledge_citations: citations,
      objectiveExcerpt: undefined,
    };
  }

  // ── 股票型 / 默认管线 ────────────────────────────────────
  {
    const g = gathered;
    const hasVault = Boolean(lookup.has_vault);

    const feeRates = g.parsed_fees;
    const feeFallback = resolveFeeFallback(lookup, feeRates);

    // ── 资产配置（股票基金优先使用雪球 API，跳过 L1”资产组合“解析）──
    let rawAlloc = lookup.asset_allocation;
    if (!rawAlloc) {
      // 雪球 API fund_individual_detail_hold_xq 等价端点
      const xqAlloc = await fetchAssetAllocationXq(
        params.fundCode,
        lookup.holdings_as_of ?? "2024-12-31",
      );
      if (xqAlloc) rawAlloc = xqAlloc.allocation;
    }

    const allocItems: Array<{ name: string; pct: number }> = [];
    if (rawAlloc) {
      const candidates = [
        { name: "股票", pct: rawAlloc.stock_pct },
        { name: "债券", pct: rawAlloc.bond_pct },
        { name: "现金", pct: rawAlloc.cash_pct },
        { name: "其他", pct: rawAlloc.other_pct },
      ];
      for (const c of candidates) {
        if (c.pct != null && c.pct > 0) allocItems.push({ name: c.name, pct: c.pct });
      }
    }
    const assetAllocation: { items: Array<{ name: string; pct: number }>; asOfDate: string } | undefined =
      allocItems.length > 0
        ? { items: allocItems, asOfDate: lookup.holdings_as_of ?? "" }
        : undefined;

    // ── 投资目标 (scope excerpt) — LLM 摘要 ──
    let scopeExcerpt: string | undefined;
    if (lookup.summary) {
      const sanitized = sanitizeCustomerFacingText(lookup.summary)
        .replace(/^#{1,6}\s+.*$/gm, "")
        .trim();
      if (sanitized) {
        const scopePrompt = `请从以下基金简介中提取一句话的"基金投资目标/投资范围"摘要（≤60个中文字符），不要输出其他内容。
如果没有投资目标相关内容，输出"暂无摘要"。

${sanitized.slice(0, 1200)}`;
        try {
          const reasoning = await ensureModelSlot("reasoning");
          if (!reasoning) {
            // 无 reasoning 模型可用，跳过摘要
          } else {
            const llmResult = await summarizeObjectiveWithLlm(
              {
                api_base_url: reasoning.api_base_url,
                api_key: reasoning.api_key_encrypted,
                model_name: reasoning.model_name ?? "mimo-v2.5",
                provider: "mimo",
              },
              sanitized,
              completeText,
            );
            if (llmResult && !llmResult.includes("暂无")) {
              scopeExcerpt = llmResult.slice(0, 60);
            }
          }
        } catch {
          // LLM 失败不阻塞
        }
      }
    }

    // ── 参考文档章节（复用货币基金引用模式）──
    const referenceChapter = buildMMReferenceChapter(
      lookup.fund_code ?? params.fundCode,
      hasVault,
    );

    // ── 组装 ──
    const navDate = await resolveAsOfTradeDate(ymd);

    const { markdown: md, chartCount } = buildStockFundReportMarkdown({
      // Ch1: 基本信息
      fundCode: lookup.fund_code ?? params.fundCode,
      fundName: lookup.fund_name ?? params.fundCode,
      typeLabel: lookup.type_label,
      riskLevel: lookup.risk_level ?? "--",
      management: lookup.management,
      custodian: lookup.custodian,
      foundDate: lookup.found_date,
      aumYi: lookup.fund_share?.aum_yi,
      aumDate: lookup.fund_share?.trade_date,
      benchmarkName: lookup.benchmark_name,
      minAmount: lookup.min_amount,
      return1yPct: lookup.return_1y_pct,
      maxDrawdown1yPct: lookup.max_drawdown_1y_pct,
      // Ch2: 基金经理
      fundManagers: lookup.fund_managers,
      // Ch3: 投资目标
      scopeExcerpt,
      // Ch4: 费率
      managementFee: feeRates?.management_pct,
      custodyFee: feeRates?.custody_pct,
      subscriptionMax: feeFallback.subscriptionMax,
      purchaseMax: feeFallback.purchaseMax,
      redemptionMax: feeFallback.redemptionMax,
      salesServiceFee: feeRates?.sales_service_pct,
      // Ch5: 前十大持仓
      topHoldings: lookup.top_holdings,
      holdingsAsOf: lookup.holdings_as_of,
      // Ch6: 资产配置
      assetAllocation,
      // Ch7: 参考文档
      referenceChapter,
      navDate,
      ymd,
      dateLabel,
    });

    // ── 写入文件 ──
    const filePath = getDraftReportPath(params.conversationId, params.runId);
    fs.writeFileSync(filePath, md, "utf8");

    const citations = buildKnowledgeCitations(g.l1_hits);
    writeDraftMeta(filePath, {
      report_type: "fund",
      conversation_id: params.conversationId,
      run_id: params.runId,
      report_name: reportName,
      fund_code: lookup.fund_code,
      report_archetype: archetype,
      holdings_kind: lookup.holdings_kind ?? null,
      holdings_source: lookup.holdings_source ?? null,
      as_of_trade_date: lookup.as_of_trade_date ?? null,
      knowledge_citations: citations,
      skip_holdings_chart: g.skip_holdings_chart,
      echarts_count: chartCount,
    });

    if (supabase) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", params.conversationId)
        .maybeSingle();

      const meta = (conv?.metadata ?? {}) as Record<string, unknown>;

      try {
        await supabase
          .from("conversations")
          .update({
            metadata: {
              ...meta,
              pending_report_draft: {
                report_type: "fund",
                fund_code: lookup.fund_code,
                file_path: filePath,
                report_name: reportName,
                run_id: params.runId,
                knowledge_citations: citations,
              },
              has_unconfirmed: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[draftFundReport] 会话元数据更新失败: ${msg}`);
        return {
          ok: false,
          error: `报告草稿已写入，但会话元数据更新失败：${msg}`,
          draft_path: filePath,
          report_name: reportName,
          fund_code: lookup.fund_code,
          preview: md.slice(0, 800),
          knowledge_citations: citations,
          objectiveExcerpt: undefined,
        };
      }
    }

    return {
      ok: true,
      draft_path: filePath,
      report_name: reportName,
      fund_code: lookup.fund_code,
      preview: md.slice(0, 800),
      knowledge_citations: citations,
      objectiveExcerpt: undefined,
    };
  }


}





function buildManagerSection(
  managers?: import("@/lib/l0/types").L0FundManagerRecord[],
): string {
  if (!managers?.length) return "";

  const rows = managers
    .map(
      (m) =>
        `| ${m.name} | ${m.begin_date ?? "—"} | ${m.end_date ?? "在任"} |`,
    )
    .join("\n");

  return `
| 姓名 | 任职起始 | 任职结束 |
|------|----------|----------|
${rows}
`.trim();
}



function isVaultPlaceholder(excerpt: string): boolean {
  return /^（请查阅/.test(excerpt.trim());
}

// ────────────────────────────────────────────────────────────────────────────
// Money market — private helpers (self-contained; no shared-module dependency)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 构建货币基金引用说明章节。
 * 写死两篇文档：基金产品资料概要 + 最新季报。
 * 文档名称为纯文本，文档地址为可点击超链接，跳转至知识库源文件整篇展示页。
 */
function buildMMReferenceChapter(
  fundCode: string,
  hasVault: boolean,
): string {
  if (!hasVault) {
    return `## 引用说明

本基金 **暂未纳入** App 本地基金知识库（或本轮未命中可溯源招募书片段）。正文中的费率、投资范围、风险等级等 **硬事实** 来自 **授权行情数据** 与 **公开联网检索**，请以基金公司最新法律文件为准。
`;
  }

  const seedRoot = getSeedFundKnowledgeRoot();
  let fundDir = "";
  if (fs.existsSync(seedRoot)) {
    const entries = fs.readdirSync(seedRoot);
    fundDir = entries.find(
      (e) => e.startsWith(fundCode) && fs.statSync(path.join(seedRoot, e)).isDirectory(),
    ) ?? "";
  }

  if (!fundDir) {
    return `## 引用说明

未找到基金 ${fundCode} 的知识库文件。
`;
  }

  const fundPath = path.join(seedRoot, fundDir);

  // ── 1. 基金产品资料概要 ──
  const prospectusFile = "product-summary.md";
  const prospectusFullPath = path.join(fundPath, "prospectus", prospectusFile);
  const hasProspectus = fs.existsSync(prospectusFullPath);
  const prospectusRelPath = `${fundDir}/prospectus/${prospectusFile}`;
  const prospectusLink = hasProspectus
    ? fundKnowledgeDeepLink({ fundCode, filePath: prospectusRelPath })
    : "";

  // ── 2. 最新季报 ──
  const qrDir = path.join(fundPath, "quarterly_report");
  let latestQrLink = "";
  let latestQrLabel = "";
  if (fs.existsSync(qrDir)) {
    const qrFiles = fs.readdirSync(qrDir).filter((f) => f.endsWith(".md"));
    const latest = findLatestQuarterlyReport(qrFiles);
    if (latest) {
      const qrRelPath = `${fundDir}/quarterly_report/${latest}`;
      latestQrLink = fundKnowledgeDeepLink({ fundCode, filePath: qrRelPath });
      latestQrLabel = latest.replace(/\.md$/, "").replace(/-quarterly-report$/, "");
    }
  }

  // ── 构建表格行 ──
  const rows: string[] = [];
  if (hasProspectus) {
    rows.push(`| 1 | 基金产品资料概要 | [查看文档](${prospectusLink}) |`);
  }
  if (latestQrLink) {
    rows.push(`| ${rows.length + 1} | ${escapeMarkdownTableCell(latestQrLabel)} 季报 | [查看文档](${latestQrLink}) |`);
  }

  if (!rows.length) {
    return `## 引用说明

未找到基金 ${fundCode} 的引用文档。
`;
  }

  return `## 引用说明

| 序号 | 文档名称 | 文档地址 |
|------|----------|----------|
${rows.join("\n")}
`;
}

/** 转义 Markdown 表格单元格中的 `|` 和换行 */
function escapeMarkdownTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** 货币基金费率表（申购/赎回固定为"—"） */
function buildMMFeeTable(fees: {
  management_pct?: number;
  custody_pct?: number;
  sales_service_pct?: number;
}): string | null {
  if (fees.management_pct == null || fees.custody_pct == null) return null;
  const m = fees.management_pct;
  const c = fees.custody_pct;
  const s = fees.sales_service_pct;
  const rows = [
    "| 费用项目 | 费率 / 规则 | 备注 |",
    "|----------|-------------|------|",
    `| 管理费 | **${m}% / 年** | 每日从净值计提，无需另行支付 |`,
    `| 托管费 | **${c}% / 年** | 同上 |`,
  ];
  if (s != null) {
    rows.push(
      `| 销售服务费 | **${s}% / 年** | 部分份额类别（如 C 类）收取 |`,
    );
  }
  rows.push("| 申购费 | — | 货币基金一般不收取申购费 |");
  rows.push("| 赎回费 | — | 货币基金一般不收取赎回费 |");
  return rows.join("\n");
}

/** 金库数据摘录前缀（有金库命中时标注数据截止日期） */
function formatMMExcerpt(
  excerpt: string,
  asOf: string | undefined,
  enabled: boolean,
): string {
  if (!enabled || !asOf || !excerpt.trim()) return excerpt;
  return `*本段数据截止 **${asOf}**（来源报告发布时间）*\n\n${excerpt}`;
}

/**
 * 从 L1 季报片段解析货币基金详细资产配置。
 * 目标分类：银行存款、同业存单、买入返售金融资产、短期融资券、债券、其他资产。
 * 优先匹配 Markdown 表格行；表格缺失时回退到正则行内提取。
 */
function parseMMAssetAllocation(hits: Array<{
  heading: string;
  excerpt: string;
  doc_type: string;
  source_as_of?: string;
}>, fundCode: string): { items: Array<{ name: string; pct: number }>; asOfDate: string; footnote?: string } | undefined {
  // 仅取季报类型 & 标题/内容含"资产组合"或"资产配置"的命中
  const qHits = hits.filter(
    (h) =>
      h.doc_type === "quarterly_report" ||
      /资产组合|资产配置/.test(h.heading) ||
      /资产组合|资产配置/.test(h.excerpt),
  );
  if (!qHits.length) {
    // Fallback: read quarterly report files directly from seed data
    const baseDir = "seed/fund-knowledge";
    if (fs.existsSync(baseDir)) {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        if (entry.startsWith(fundCode) && fs.statSync(`${baseDir}/${entry}`).isDirectory()) {
          const qrDir = `${baseDir}/${entry}/quarterly_report`;
          if (fs.existsSync(qrDir)) {
            const mdFiles = fs.readdirSync(qrDir).filter(f => f.endsWith(".md"));
            const latestFile = findLatestQuarterlyReport(mdFiles);
            if (latestFile) {
              const fallbackText = fs.readFileSync(`${qrDir}/${latestFile}`, "utf8");
              const items: Array<{ name: string; pct: number }> = [];
              const seen = new Set<string>();
              const tableRowRe = /\|?\s*(银行存款[^\d|]*|同业存单[^\d|]*|买入返售[^\d|]*|短期融资券[^\d|]*|债券[^\d|]*|其他资产[^\d|]*)\s*\|?\s*(\d+\.?\d*)%/gi;
              let m: RegExpExecArray | null;
              while ((m = tableRowRe.exec(fallbackText)) !== null) {
                const raw = m[1].replace(/\|/g, "").replace(/[*_#]/g, "").trim();
                const name = normalizeMMAssetName(raw);
                const pct = parseFloat(m[2]);
                if (!seen.has(name) && Number.isFinite(pct) && pct > 0 && pct <= 100) {
                  seen.add(name);
                  items.push({ name, pct });
                }
              }
              if (items.length) {
                items.sort((a, b) => b.pct - a.pct);
                return { items, asOfDate: latestFile.replace(/\.md$/, "").slice(-7) || "最新季报" };
              }
            }
          }
          break;
        }
      }
    }
  }

  const text = qHits.map((h) => h.excerpt).join("\n");
  const asOf = qHits[0].source_as_of ?? "最新季报";

  // 策略1：匹配 Markdown 表格（| 资产类别 | 占净值比例 | …）
  const tableRowRe =
    /\|?\s*(银行存款[^\d|]*|同业存单[^\d|]*|买入返售[^\d|]*|短期融资券[^\d|]*|债券[^\d|]*|其他资产[^\d|]*)\s*\|?\s*(\d+\.?\d*)%/gi;
  const items: Array<{ name: string; pct: number }> = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = tableRowRe.exec(text)) !== null) {
    const raw = m[1].replace(/\|/g, "").replace(/[*_#]/g, "").trim();
    const name = normalizeMMAssetName(raw);
    const pct = parseFloat(m[2]);
    if (!seen.has(name) && Number.isFinite(pct) && pct > 0 && pct <= 100) {
      seen.add(name);
      items.push({ name, pct });
    }
  }

  // 策略2：表格匹配不到时回退到行内正则
  if (!items.length) {
    const inlineRe =
      /(银行存款[^\d]*|同业存单[^\d]*|买入返售[^\d]*|短期融资券[^\d]*|债券[^\d]*|其他资产[^\d]*[（(]?[交易投资类]?[）)]?)\s+(\d+\.?\d*)%/gi;
    while ((m = inlineRe.exec(text)) !== null) {
      const name = normalizeMMAssetName(m[1]);
      const pct = parseFloat(m[2]);
      if (!seen.has(name) && Number.isFinite(pct) && pct > 0 && pct <= 100) {
        seen.add(name);
        items.push({ name, pct });
      }
    }
  }

  if (!items.length) {
    // Secondary fallback: read quarterly report files directly when chunks exist but regex finds nothing
    const fbBaseDir = "seed/fund-knowledge";
    if (fs.existsSync(fbBaseDir)) {
      const fbEntries = fs.readdirSync(fbBaseDir);
      for (const fbEntry of fbEntries) {
        if (fbEntry.startsWith(fundCode) && fs.statSync(`${fbBaseDir}/${fbEntry}`).isDirectory()) {
          const fbQrDir = `${fbBaseDir}/${fbEntry}/quarterly_report`;
          if (fs.existsSync(fbQrDir)) {
            const fbMdFiles = fs.readdirSync(fbQrDir).filter(f => f.endsWith(".md"));
            const fbLatestFile = findLatestQuarterlyReport(fbMdFiles);
            if (fbLatestFile) {
              const fbText = fs.readFileSync(`${fbQrDir}/${fbLatestFile}`, "utf8");
              const fbTableRowRe = /\|?\s*(银行存款[^\d|]*|同业存单[^\d|]*|买入返售[^\d|]*|短期融资券[^\d|]*|债券[^\d|]*|其他资产[^\d|]*)\s*\|?\s*(\d+\.?\d*)%/gi;
              let fbM: RegExpExecArray | null;
              while ((fbM = fbTableRowRe.exec(fbText)) !== null) {
                const fbRaw = fbM[1].replace(/\|/g, "").replace(/[*_#]/g, "").trim();
                const fbName = normalizeMMAssetName(fbRaw);
                const fbPct = parseFloat(fbM[2]);
                if (!seen.has(fbName) && Number.isFinite(fbPct) && fbPct > 0 && fbPct <= 100) {
                  seen.add(fbName);
                  items.push({ name: fbName, pct: fbPct });
                }
              }
              if (!items.length) {
                const fbInlineRe = /(银行存款[^\d]*|同业存单[^\d]*|买入返售[^\d]*|短期融资券[^\d]*|债券[^\d]*|其他资产[^\d]*[（(]?[交易投资类]?[）)]?)\s+(\d+\.?\d*)%/gi;
                while ((fbM = fbInlineRe.exec(fbText)) !== null) {
                  const fbName = normalizeMMAssetName(fbM[1]);
                  const fbPct = parseFloat(fbM[2]);
                  if (!seen.has(fbName) && Number.isFinite(fbPct) && fbPct > 0 && fbPct <= 100) {
                    seen.add(fbName);
                    items.push({ name: fbName, pct: fbPct });
                  }
                }
              }
              break;
            }
          }
          break;
        }
      }
    }
  }

  if (!items.length) return undefined;

  // 按占比降序
  items.sort((a, b) => b.pct - a.pct);

  return { items, asOfDate: asOf };
}

/**
 * 从季报文件列表中找出最新的一份。
 * 排序规则：先比年份（数字越大越新），再比季度（Q1-Q4，数字越大越新）。
 * 文件名格式示例：2026Q2-quarterly-report.md
 */
function findLatestQuarterlyReport(files: string[]): string | null {
  if (!files.length) return null;
  return files.sort((a, b) => {
    const matchA = a.match(/(\d{4})Q(\d)/);
    const matchB = b.match(/(\d{4})Q(\d)/);
    if (!matchA && !matchB) return 0;
    if (!matchA) return 1;
    if (!matchB) return -1;
    const yearDiff = parseInt(matchB[1]) - parseInt(matchA[1]);
    if (yearDiff !== 0) return yearDiff;
    return parseInt(matchB[2]) - parseInt(matchA[2]);
  })[0];
}

/** 统一货币基金资产类别名称 */
function normalizeMMAssetName(raw: string): string {
  const s = raw.trim();
  if (/银行存款/.test(s)) return "银行存款";
  if (/同业存单/.test(s)) return "同业存单";
  if (/买入返售/.test(s)) return "买入返售金融资产";
  if (/短期融资券/.test(s)) return "短期融资券";
  if (/债券/.test(s)) return "债券";
  if (/其他资产/.test(s)) return "其他资产";
  return s.slice(0, 12);
}

/** Reads expert-opinion seed files and calls LLM to summarize into up to 4 bullets. Returns undefined when no seed files found or LLM unavailable. */
async function summarizeMMExpertOpinions(
  fundCode: string,
  fundName: string,
): Promise<Array<{ text: string; footnote?: string }> | undefined> {
  try {
  const seedDir = findExpertOpinionDir(fundCode);
  if (!seedDir) {
    console.warn("[summarizeMMExpertOpinions] 未找到 expert_opinion 目录", { fundCode });
    return undefined;
  }

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith(".md"));
  if (!files.length) return undefined;

  const contents = files
    .map((f) => {
      const raw = fs.readFileSync(path.join(seedDir, f), "utf8");
      return raw.replace(/^---[\s\S]*?---\n?/, "").trim();
    })
    .filter(Boolean);

  if (!contents.length) return undefined;

  const prompt = [
    `你是一位专业的基金研究分析师。请根据以下关于 **${fundName}**（${fundCode}）货币基金的专家研究报告，提取并总结出 **≤4 条** 核心观点。`,
    "",
    "要求：",
    "1. 每条观点 ≤75 字，简洁有力",
    "2. 观点应为事实性结论或专业判断，不是模棱两可的陈述",
    "3. 仅输出观点列表，格式：每条一行，以 \"- \" 开头",
    "4. 不要输出前言、结语或任何注释",
    "",
    "--- 研究报告 ---",
    ...contents.map((c) => c.slice(0, 800)),
  ].join("\n");

  const slot = await ensureModelSlot("reasoning");
  if (!slot) {
    console.warn("[summarizeMMExpertOpinions] LLM slot 'reasoning' 不可用，回退至原始摘要");
    // LLM 不可用时返回原始文件内容作为观点
    const rawBullets = contents.map((c) => {
      // Take first meaningful line or first 80 chars as bullet text
      const firstLine = c.split("\n").find(l => l.trim() && !l.startsWith("#"))?.trim() ?? c.slice(0, 80);
      return { text: firstLine.slice(0, 75) };
    });
    return rawBullets.length ? rawBullets.slice(0, 4) : undefined;
  }

  const raw = await completeText(
    {
      api_base_url: slot.api_base_url,
      api_key: slot.api_key_encrypted,
      model_name: slot.model_name ?? "mimo-v2.5",
      provider: "mimo",
    },
    {
    system: "你是一位专业的基金研究分析师，擅长从研究报告提炼核心观点。",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 400,
    temperature: 0.3,
  });

  if (!raw) return undefined;

  // 解析 LLM 输出为观点列表（扩展格式支持中文 LLM 常见输出）
  const allLines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletPrefixRe = /^[-*·] |^(?:（\d+）|第\d+条|\d+[\.、）)]) /;
  const lines = allLines.filter(
    (l) =>
      l.startsWith("- ") ||
      l.startsWith("* ") ||
      l.startsWith("1. ") ||
      l.startsWith("· ") ||
      /^（\d+）/.test(l) ||
      /^第\d+条/.test(l) ||
      /^\d+[\.、] /.test(l),
  );
  // Fallback 1: if still no bullets, accept any line >10 chars not starting with #
  const resolvedLines = lines.length
    ? lines
    : allLines.filter((l) => l.length > 10 && !l.startsWith("#"));
  // Fallback 2: if still empty, take lines >20 chars ignoring Markdown syntax lines
  const finalLines = resolvedLines.length
    ? resolvedLines
    : allLines.filter(
        (l) => l.length > 20 && !l.startsWith("#") && !l.startsWith(">"),
      );

  const bullets = finalLines.map((l) => ({
    text: l
      .replace(/^[-\*\.·\d]+[\.\、\s）\)]*\s*/, "")
      .replace(/^第\d+条\s*/, "")
      .replace(/^（\d+）\s*/, "")
      .trim()
      .replace(/^["""]|["「」""]$/g, ""),
  }));

  return bullets.length ? bullets.slice(0, 4) : undefined;
  } catch (err) {
    console.warn("[summarizeMMExpertOpinions] 异常", err);
    return undefined;
  }
}

/** 在 seed/fund-knowledge/ 下查找指定基金的 expert_opinion 目录 */
function findExpertOpinionDir(fundCode: string): string | null {
  const baseDir = path.join(getProjectRoot(), "seed", "fund-knowledge");
  if (!fs.existsSync(baseDir)) return null;

  const entries = fs.readdirSync(baseDir);
  for (const entry of entries) {
    if (
      entry.startsWith(fundCode) &&
      fs.statSync(path.join(baseDir, entry)).isDirectory()
    ) {
      const opinionDir = path.join(baseDir, entry, "expert_opinion");
      if (fs.existsSync(opinionDir)) return opinionDir;
    }
  }
  return null;
}

/** 从 vault 最新季报中解析「前五大持仓债券」表格（vault 回退路径） */
function parseBondTop5FromQuarterlyReports(
  fundCode: string,
): { holdings: Array<{ name: string; issuer: string; weight_pct: number; maturity: string }>; asOfLabel: string } | undefined {
  const vaultRoot = getFundKnowledgeRoot();
  if (!fs.existsSync(vaultRoot)) return undefined;

  // 查找该基金在 vault 中的目录
  let qrDir: string | null = null;
  for (const entry of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(fundCode)) {
      const candidate = path.join(vaultRoot, entry.name, "quarterly_report");
      if (fs.existsSync(candidate)) {
        qrDir = candidate;
        break;
      }
    }
  }
  if (!qrDir) return undefined;

  const mdFiles = fs.readdirSync(qrDir).filter((f) => f.endsWith(".md"));
  const latestFile = findLatestQuarterlyReport(mdFiles);
  if (!latestFile) return undefined;

  const fullPath = path.join(qrDir, latestFile);
  const text = fs.readFileSync(fullPath, "utf8");

  // 定位「前五大持仓债券」区块，解析其下的 markdown 表格
  const sectionRe = /#{2,3}\s*[一二三四五六七八九十\d]+[、．.]?\s*前五大持仓债券/;
  const secMatch = text.match(sectionRe);
  if (!secMatch || secMatch.index === undefined) return undefined;

  // 从标题行之后取 30 行作为表格上下文
  const afterHeading = text.slice(secMatch.index);
  const lines = afterHeading.split("\n");
  const dataStart = lines.findIndex((l) => /^\|?\s*\d+\s*\|/.test(l));

  if (dataStart < 0) return undefined;
  const tableRows = lines.slice(dataStart).filter((l) => /^\|?\s*\d+\s*\|/.test(l)).slice(0, 5);

  if (!tableRows.length) return undefined;

  const holdings: Array<{ name: string; issuer: string; weight_pct: number; maturity: string }> = [];
  for (const row of tableRows) {
    const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length < 5) continue; // 序号 + 名称 + 发行主体 + 占净值比例 + 剩余期限
    const name = cols[1]?.replace(/[*_#]/g, "").trim() ?? "";
    const issuer = cols[2]?.replace(/[*_#]/g, "").trim() ?? "";
    const pctRaw = cols[3]?.replace(/[*_#]|%|\s/g, "") ?? "";
    const pct = parseFloat(pctRaw);
    const maturity = cols[4]?.replace(/[*_#]/g, "").trim() ?? "";
    if (!name || !isFinite(pct)) continue;
    holdings.push({ name, issuer, weight_pct: pct, maturity });
  }

  if (!holdings.length) return undefined;

  // 文件名如 2026Q2-quarterly-report.md，取 2026Q2 部分
  const stem = latestFile.replace(/\.md$/, "").split("-")[0] ?? "";
  const qMatch = stem.match(/^(\d{4})Q(\d)$/);
  const asOfLabel = qMatch
    ? `${qMatch[1]} 年 Q${qMatch[2]} 季报`
    : "最新季报";

  return { holdings, asOfLabel };
}

/** 从 vault 的年度/半年报告中读取持有人结构（HOLDER-01） */
function readHolderStructureFromVault(fundCode: string): {
  individual_pct: number;
  institution_pct: number;
  internal_pct?: number;
  as_of: string;
  as_of_label: string;
} | undefined {
  const vaultRoot = getFundKnowledgeRoot();
  if (!fs.existsSync(vaultRoot)) return undefined;

  let reportDir: string | null = null;
  for (const entry of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(fundCode)) {
      const candidate = path.join(vaultRoot, entry.name, "annual_report");
      if (fs.existsSync(candidate)) {
        reportDir = candidate;
        break;
      }
    }
  }
  if (!reportDir) return undefined;

  // 优先读最新的年报，其次半年报
  const mdFiles = fs
    .readdirSync(reportDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  const targetFile = mdFiles.find((f) => /annual|semi.?annual/.test(f)) ?? mdFiles[0];
  if (!targetFile) return undefined;

  const text = fs.readFileSync(path.join(reportDir, targetFile), "utf8");
  const parsed = parseHolderStructureFromText(text);
  if (!parsed) return undefined;

  const dateInfo = deriveReportDateAndLabel(targetFile);
  if (!dateInfo) return undefined;

  return { ...parsed, ...dateInfo };
}
