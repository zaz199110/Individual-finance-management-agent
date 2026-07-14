import { describe, it, expect } from "vitest";
import {
  buildPnlBarChart,
  buildCategoryPieChart,
  wrapEchartsMarkdown,
} from "./echarts-skeleton";
import type { PortfolioPositionMetrics } from "./holdings-nav-gather";
import type { CategorySlice } from "./category-map";

describe("echarts-skeleton", () => {
  describe("buildPnlBarChart", () => {
    it("正常数据生成横条图", () => {
      const positions: PortfolioPositionMetrics[] = [
        {
          fund_code: "003547",
          fund_name: "鹏华丰享债券A",
          invested_at: "2025-08-12",
          paid_amount: 30000,
          shares: 28412.35,
          l0_ok: true,
          pnl_abs: 1280,
          pnl_pct: 4.3,
        },
        {
          fund_code: "000509",
          fund_name: "广发钱袋子货币A",
          invested_at: "2025-08-12",
          paid_amount: 20000,
          shares: 20000,
          l0_ok: true,
          pnl_abs: 360,
          pnl_pct: 1.8,
        },
      ];

      const result = buildPnlBarChart(positions);

      expect(result).not.toBeNull();
      expect(result!.title).toBe("各持仓持有收益（元）");
      expect(result!.option).toHaveProperty("series");
    });

    it("无有效数据返回 null", () => {
      const positions: PortfolioPositionMetrics[] = [
        {
          fund_code: "999999",
          fund_name: "测试基金",
          invested_at: "2025-01-01",
          paid_amount: 10000,
          shares: 10000,
          l0_ok: false,
        },
      ];

      const result = buildPnlBarChart(positions);
      expect(result).toBeNull();
    });

    it("按收益从高到低排序", () => {
      const positions: PortfolioPositionMetrics[] = [
        {
          fund_code: "A",
          fund_name: "鹏华丰享债券",
          invested_at: "2025-01-01",
          paid_amount: 10000,
          shares: 10000,
          l0_ok: true,
          pnl_abs: 100,
        },
        {
          fund_code: "B",
          fund_name: "招商白酒指数",
          invested_at: "2025-01-01",
          paid_amount: 10000,
          shares: 10000,
          l0_ok: true,
          pnl_abs: 500,
        },
      ];

      const result = buildPnlBarChart(positions);
      expect(result).not.toBeNull();

      const yAxis = result!.option.yAxis as { data: string[] };
      expect(yAxis.data[0]).toContain("招商白酒");
      expect(yAxis.data[1]).toContain("鹏华丰享");
    });
  });

  describe("buildCategoryPieChart", () => {
    it("正常数据生成饼图", () => {
      const slices: CategorySlice[] = [
        { category: "股票型", market_value: 38500, pct: 32.5 },
        { category: "债券型", market_value: 60000, pct: 50.6 },
        { category: "货币型", market_value: 20000, pct: 16.9 },
      ];

      const result = buildCategoryPieChart(slices);

      expect(result).not.toBeNull();
      expect(result!.title).toBe("持仓结构分布（按市值）");
      expect(result!.option).toHaveProperty("series");
    });

    it("无有效数据返回 null", () => {
      const slices: CategorySlice[] = [
        { category: "股票型", market_value: 0, pct: 0 },
        { category: "债券型", market_value: 0, pct: 0 },
        { category: "货币型", market_value: 0, pct: 0 },
      ];

      const result = buildCategoryPieChart(slices);
      expect(result).toBeNull();
    });
  });

  describe("wrapEchartsMarkdown", () => {
    it("包装为 markdown 代码块", () => {
      const config = {
        title: "测试图表",
        subtext: "副标题",
        option: { series: [] },
      };

      const result = wrapEchartsMarkdown(config);

      expect(result).toContain("```echarts");
      expect(result).toContain('"series"');
      expect(result).toContain("```");
    });
  });
});
