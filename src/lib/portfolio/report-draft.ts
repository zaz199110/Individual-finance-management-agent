/**
 * report-draft.ts · 持仓分析报告草稿生成
 *
 * 职责：调用 gather → blueprint → 生成完整草稿 + draft-meta
 * 参考：requirement/docs/samples/portfolio-report-blueprint.md
 */

import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildModelProbeConfig } from "@/lib/settings/model-probe";
import { resolveModelSlot } from "@/lib/supabase/server";
import { writeDraftMeta } from "@/lib/reports/draft-meta";
import { getDraftReportPath } from "@/lib/reports/draft-path";
import { buildPortfolioReportName } from "./portfolio-report-name";
import { gatherHoldingsNavMetrics, type PortfolioGatherResult } from "./holdings-nav-gather";
import { classifyFund, aggregateCategories, type PortfolioDisplayCategory } from "./category-map";
import { buildPortfolioReportBlueprint, aggregateByFundCode, type BlueprintResult } from "./report-blueprint";
import { composePortfolioReport, type ComposeResult } from "./portfolio-report-compose";
import {
  buildPnlBarChart,
  buildCategoryPieChart,
  wrapEchartsMarkdown,
} from "./echarts-skeleton";
import type { HoldingsPosition } from "./types";

// ─── 导出接口 ────────────────────────────────────────────────────────────────

export interface PortfolioReportDraftResult {
  ok: boolean;
  draft_path?: string;
  report_name?: string;
  holdings_version_id?: string;
  preview?: string;
  gather?: PortfolioGatherResult;
  blueprint?: BlueprintResult;
  compose?: ComposeResult;
  error?: string;
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

export async function draftPortfolioReport(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    holdingsVersionId?: string;
  },
): Promise<PortfolioReportDraftResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  // ── 1. 获取持仓 ──────────────────────────────────────────────────────────

  let versionId = params.holdingsVersionId;
  let positions: HoldingsPosition[] = [];
  let confirmedAt: string | null = null;

  if (versionId) {
    const { data } = await supabase
      .from("holdings_versions")
      .select("id, positions, confirmed_at")
      .eq("id", versionId)
      .maybeSingle();
    if (!data) {
      return { ok: false, error: "未找到指定持仓版本。" };
    }
    positions = (data.positions ?? []) as HoldingsPosition[];
    confirmedAt = data.confirmed_at as string;
  } else {
    const { data } = await supabase
      .from("holdings_versions")
      .select("id, positions, confirmed_at")
      .eq("is_current", true)
      .maybeSingle();
    if (!data?.id) {
      return { ok: false, error: "请先确认并保存当前持仓。" };
    }
    versionId = data.id as string;
    positions = (data.positions ?? []) as HoldingsPosition[];
    confirmedAt = data.confirmed_at as string;
  }

  if (positions.length === 0) {
    return { ok: false, error: "当前持仓为空，无法生成分析报告。" };
  }

  // ── 2. Gather L0 数据 ─────────────────────────────────────────────────────

  let gather: PortfolioGatherResult;
  try {
    gather = await gatherHoldingsNavMetrics(positions, { force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `L0 数据同步失败：${msg}` };
  }

  // ── 3. 分类映射 ──────────────────────────────────────────────────────────

  // 从 gather 结果中获取 fund_type，逐个分类
  const categoryMap = new Map<string, ReturnType<typeof classifyFund>>();
  for (const pos of positions) {
    const metrics = gather.positions.find((m) => m.fund_code === pos.fund_code);
    categoryMap.set(
      pos.fund_code,
      classifyFund({
        fund_type: metrics?.fund_type ?? (pos as HoldingsPosition & { fund_type?: string }).fund_type,
        fund_name: pos.fund_name,
      }),
    );
  }

  // ── 4. 报告命名 ──────────────────────────────────────────────────────────

  // 统一使用北京时间（UTC+8）
  const now = new Date();
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const ymd = bjTime.toISOString().slice(0, 10).replace(/-/g, "");
  const dateLabel = `${bjTime.getUTCFullYear()}年${bjTime.getUTCMonth() + 1}月${bjTime.getUTCDate()}日`;

  const reportName = buildPortfolioReportName({ ymd });

  // ── 5. Blueprint 生成报告 ─────────────────────────────────────────────────

  const blueprint = buildPortfolioReportBlueprint({
    reportName,
    dateLabel,
    asOfTradeDate: gather.as_of_trade_date,
    gather,
    categoryMap,
  });

  // ── 5.5. Compose 填充占位符 ──────────────────────────────────────────────

  const reasoningRow = await resolveModelSlot("reasoning");
  const reasoningCfg = reasoningRow
    ? buildModelProbeConfig("reasoning", reasoningRow)
    : null;

  let composeResult: ComposeResult;
  try {
    composeResult = await composePortfolioReport({
      markdown: blueprint.markdown,
      gather,
      enableLlm: reasoningCfg != null,
      cfg: reasoningCfg ?? undefined,
    });
  } catch (err) {
    // compose 失败不阻断，使用原始 blueprint
    console.warn("compose 失败，使用 blueprint 原文:", err);
    composeResult = {
      markdown: blueprint.markdown,
      filledPlaceholders: [],
      unfilledPlaceholders: blueprint.placeholders,
      hasLlmFailure: false,
    };
  }

  // ── 5.6. 插入 ECharts 图表 ──────────────────────────────────────────────

  let finalMarkdown = composeResult.markdown;

  // Aggregate by fund_code for chart (same logic as blueprint §二-§五)
  const fundLevel = aggregateByFundCode(gather.positions);

  // §二 持有收益横条图
  const pnlBarChart = buildPnlBarChart(fundLevel);
  if (pnlBarChart) {
    finalMarkdown = finalMarkdown.replace(
      "<!-- PORT-CH2-ECHARTS -->",
      wrapEchartsMarkdown(pnlBarChart),
    );
  }

  // §三 大类环图
  const categoryRows = gather.positions
    .filter((p) => p.l0_ok && p.market_value != null && p.market_value > 0)
    .map((p) => ({
      market_value: p.market_value!,
      category: (categoryMap.get(p.fund_code)?.display ?? "其他") as PortfolioDisplayCategory,
    }));
  const categorySlices = aggregateCategories(categoryRows);
  const categoryPieChart = buildCategoryPieChart(categorySlices);
  if (categoryPieChart) {
    finalMarkdown = finalMarkdown.replace(
      "<!-- PORT-CH3-ECHARTS -->",
      wrapEchartsMarkdown(categoryPieChart),
    );
  }

  // ── 6. 写入草稿文件 ──────────────────────────────────────────────────────

  const filePath = getDraftReportPath(params.conversationId, params.runId);
  fs.writeFileSync(filePath, finalMarkdown, "utf8");

  // ── 7. 写入 draft-meta ───────────────────────────────────────────────────

  writeDraftMeta(filePath, {
    report_type: "portfolio",
    conversation_id: params.conversationId,
    run_id: params.runId,
    report_name: reportName,
    holdings_version_id: versionId,
    l0_degraded: gather.l0_degraded,
    has_dividend_missing: gather.positions.some((p) => p.dividend_missing),
    return_estimate: true,
  });

  // ── 8. 更新会话元数据 ────────────────────────────────────────────────────

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
            report_type: "portfolio",
            holdings_version_id: versionId,
            file_path: filePath,
            report_name: reportName,
            run_id: params.runId,
            gather_summary: {
              total_cost: gather.total_cost,
              total_market_value: gather.total_market_value,
              total_pnl_abs: gather.total_pnl_abs,
              total_pnl_pct: gather.total_pnl_pct,
              position_count: gather.positions.length,
            },
          },
          has_unconfirmed: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.conversationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[draftPortfolioReport] 会话元数据更新失败: ${msg}`);
    return {
      ok: false,
      error: `报告草稿已写入，但会话元数据更新失败：${msg}`,
      draft_path: filePath,
      report_name: reportName,
      holdings_version_id: versionId,
      preview: finalMarkdown.slice(0, 1000),
      gather,
      blueprint,
      compose: composeResult,
    };
  }

  // ── 9. 返回结果 ──────────────────────────────────────────────────────────

  return {
    ok: true,
    draft_path: filePath,
    report_name: reportName,
    holdings_version_id: versionId,
    preview: finalMarkdown.slice(0, 1000),
    gather,
    blueprint,
    compose: composeResult,
  };
}
