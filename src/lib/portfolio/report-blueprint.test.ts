import { describe, it, expect } from "vitest";
import {
  buildPortfolioReportBlueprint,
  PLACEHOLDERS,
  type BlueprintParams,
} from "./report-blueprint";
import type { PortfolioGatherResult } from "./holdings-nav-gather";
import { classifyFund } from "./category-map";

function makeGatherResult(overrides?: Partial<PortfolioGatherResult>): PortfolioGatherResult {
  return {
    as_of_trade_date: "2026-06-13",
    positions: [
      {
        fund_code: "003547",
        fund_name: "鹏华丰享债券A",
        invested_at: "2025-08-12",
        paid_amount: 30000,
        shares: 28412.35,
        l0_ok: true,
        nav_latest: 1.1,
        market_value: 31280,
        pnl_abs: 1280,
        pnl_pct: 4.3,
        dividend_missing: false,
      },
      {
        fund_code: "000509",
        fund_name: "广发钱袋子货币A",
        invested_at: "2025-08-12",
        paid_amount: 20000,
        shares: 20000,
        l0_ok: true,
        nav_latest: 1.018,
        market_value: 20360,
        pnl_abs: 360,
        pnl_pct: 1.8,
        dividend_missing: false,
      },
    ],
    total_cost: 50000,
    total_market_value: 51640,
    total_pnl_abs: 1640,
    total_pnl_pct: 3.3,
    l0_degraded: [],
    dividendMissingFunds: [],
    ...overrides,
  };
}

function makeCategoryMap(codes: string[]) {
  const map = new Map();
  for (const code of codes) {
    map.set(code, classifyFund({ fund_type: code === "003547" ? "债券型" : "货币型" }));
  }
  return map;
}

describe("buildPortfolioReportBlueprint", () => {
  it("基本结构", () => {
    const gather = makeGatherResult();
    const categoryMap = makeCategoryMap(["003547", "000509"]);

    const params: BlueprintParams = {
      reportName: "持仓分析报告-20260615",
      dateLabel: "2026年6月15日",
      asOfTradeDate: "2026年6月13日",
      gather,
      categoryMap,
    };

    const result = buildPortfolioReportBlueprint(params);

    expect(result.markdown).toContain("# 持仓分析报告-20260615");
    expect(result.markdown).toContain("为您生成 · 2026年6月15日");
    expect(result.markdown).toContain("数据截至 **2026年6月13日（最近交易日）**");
    expect(result.markdown).not.toContain("对照「");
    expect(result.markdown).not.toContain("## 对照方案");
    expect(result.markdown).not.toContain("## 再平衡参考");

    expect(result.placeholders).toContain(PLACEHOLDERS.CH2_INTRO);
    expect(result.placeholders).toContain(PLACEHOLDERS.CH3_INTRO);
    expect(result.placeholders).toContain(PLACEHOLDERS.CH5_SUPP);

    // TODO: re-enable after refactor — metadata no longer includes variant
    // expect(result.metadata.variant).toBe("A");
    expect(result.metadata.positionCount).toBe(2);
    expect(result.metadata.totalCost).toBe(50000);
  });

  it("L0 降级时显示暂无行情", () => {
    const gather = makeGatherResult({
      positions: [
        {
          fund_code: "999999",
          fund_name: "测试基金",
          invested_at: "2025-01-01",
          paid_amount: 10000,
          shares: 10000,
          l0_ok: false,
          dividend_missing: true,
        },
      ],
      total_cost: 10000,
      total_market_value: 0,
      total_pnl_abs: -10000,
      total_pnl_pct: -100,
      l0_degraded: ["999999"],
      dividendMissingFunds: ["测试基金"],
    });
    const categoryMap = new Map();
    categoryMap.set("999999", classifyFund({ fund_type: "测试" }));

    const params: BlueprintParams = {
      reportName: "持仓分析报告-20260615",
      dateLabel: "2026年6月15日",
      asOfTradeDate: "2026年6月13日",
      gather,
      categoryMap,
    };

    const result = buildPortfolioReportBlueprint(params);

    expect(result.markdown).toContain("暂无行情");
    expect(result.markdown).toContain("未纳入现金分红");
    expect(result.metadata.l0Degraded).toContain("999999");
    expect(result.metadata.dividendMissingFunds).toEqual(["测试基金"]);
  });

  it("包含所有必需章节", () => {
    const gather = makeGatherResult();
    const categoryMap = makeCategoryMap(["003547", "000509"]);

    const params: BlueprintParams = {
      reportName: "持仓分析报告-20260615",
      dateLabel: "2026年6月15日",
      asOfTradeDate: "2026年6月13日",
      gather,
      categoryMap,
    };

    const result = buildPortfolioReportBlueprint(params);

    expect(result.markdown).toContain("## 持仓明细");
    expect(result.markdown).toContain("## 收益概况");
    expect(result.markdown).toContain("## 结构分布");
    expect(result.markdown).toContain("## 基金解读");
    expect(result.markdown).toContain("## 风险与合规");

    expect(result.markdown).toContain(PLACEHOLDERS.CH4_FUND("003547"));
    expect(result.markdown).toContain(PLACEHOLDERS.CH4_FUND("000509"));
  });
});
