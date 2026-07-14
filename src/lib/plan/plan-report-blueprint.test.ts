import { describe, expect, it } from "vitest";
import { loadSamplePlanAllocation, loadSamplePlanDetail } from "@/lib/plan/samples";
import {
  buildCategoryPieChart,
  buildPlanReportMarkdown,
} from "@/lib/plan/plan-report-blueprint";
import { deriveRiskMetricsFromIndices } from "@/lib/plan/risk-index";
import { planCheckConflicts, planCheckCompleteness } from "@/harness/verify/plan";
import type { InvestmentConstraints } from "@/lib/profile/types";

describe("plan-report-blueprint", () => {
  it("builds markdown with >=2 echarts from sample payloads", () => {
    const alloc = loadSamplePlanAllocation();
    const detail = loadSamplePlanDetail();
    const risk = deriveRiskMetricsFromIndices({
      weights: { 股票类: 25, 债券类: 55, 货币类: 20 },
      indexMetrics: {
        stock: [{ vol_annual_pct: 18, max_drawdown_pct: -15, window_years: 3, source: "anchor" }],
        bond: [{ vol_annual_pct: 3, max_drawdown_pct: -2.5, window_years: 3, source: "anchor" }],
        cash: [{ vol_annual_pct: 0.5, max_drawdown_pct: -0.2, window_years: 3, source: "anchor" }],
        has_live: false,
      },
      goalType: "retirement",
    });

    const result = buildPlanReportMarkdown({
      sceneName: "退休养老",
      goalType: "retirement",
      ymd: "20260622",
      dateLabel: "2026年6月22日",
      asOfDate: "2026年6月21日",
      constraints: {
        goal_type: "wealth_growth",
        risk_tolerance: "稳健",
        max_drawdown: "约 -15%",
        target_return: 6,
        liquidity_need: "退休前原则上不动",
        deploy_mode: "每月定投，约 24 个月投完",
        investment_scope: "中国公募基金",
      } as unknown as InvestmentConstraints,
      principalAmount: 120000,
      monthlyAmount: 1000,
      targetAllocation: alloc.target_allocation,
      allocationRationale: alloc.allocation_rationale,
      detailedPlan: detail.detailed_plan as { categories: import("@/lib/plan/plan-report-blueprint").PlanDetailCategory[] },
      executionSchedule: detail.execution_schedule as Record<string, unknown>,
      webCitations: detail.web_citations,
      riskMetrics: risk,
    });

    expect(result.echartsCount).toBeGreaterThanOrEqual(2);
    expect(result.markdown).toContain("退休养老-资产配置方案-20260622");
    expect(result.markdown).not.toContain("投资规划书");
    expect(result.markdown).toContain("```echarts");
    expect(result.markdown).toContain("个人信息");
    expect(result.markdown).toContain("投资场景需求");
    expect(result.markdown).toContain("配置基金");
    expect(result.markdown).toContain("分批建仓计划");
  });

  it("category pie chart is valid JSON", () => {
    const alloc = loadSamplePlanAllocation();
    const block = buildCategoryPieChart(alloc.target_allocation.categories);
    const json = block.match(/```echarts\n([\s\S]*?)```/)?.[1];
    expect(json).toBeTruthy();
    expect(() => JSON.parse(json!)).not.toThrow();
  });
});

describe("plan verify hooks", () => {
  it("sample allocation passes step1 hooks", () => {
    const alloc = loadSamplePlanAllocation();
    const ctx = {
      constraints: {
        goal_type: "wealth_growth",
        risk_tolerance: "稳健",
        max_drawdown: "约 -15%",
        target_return: 6,
        liquidity_need: "退休前原则上不动",
        deploy_mode: "每月定投",
      },
    };
    expect(planCheckConflicts(alloc, 1, ctx).ok).toBe(true);
    expect(planCheckCompleteness(alloc, 1, ctx).ok).toBe(true);
  });

  it("sample detail passes step2 hooks when screened", () => {
    const detail = loadSamplePlanDetail();
    const ctx = {
      constraints: { deploy_mode: "phased" },
      screened: true,
      goal_type: "retirement",
    };
    expect(planCheckConflicts(detail, 2, ctx).ok).toBe(true);
    expect(planCheckCompleteness(detail, 2, ctx).ok).toBe(true);
  });
});
