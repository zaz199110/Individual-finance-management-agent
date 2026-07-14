import { describe, expect, it } from "vitest";
import {
  buildAssetPieChart,
  buildFeeCompareBarChart,
  buildFundReportEchartsMarkdown,
  buildHoldingsBarChart,
  buildReturnCompareBarChart,
} from "@/lib/fund/echarts-skeleton";
import {
  normalizeReportEchartsOption,
  resolveReportChartHeight,
} from "./echarts-normalize";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const BASE_INPUT = {
  fundCode: "206007",
  fundName: "鹏华消费优选混合",
  archetype: "D" as const,
  holdingsAsOf: "2026-05-31",
  assetAllocation: { stock_pct: 88.5, bond_pct: 6.2, cash_pct: 5.3 },
  topHoldings: [
    { name: "样例股票", code: "000001", asset_type: "stock" as const, weight_pct: 5.2 },
  ],
  return1yPct: 12.5,
  benchmarkReturn1yPct: 10.2,
  benchmarkName: "沪深300指数",
  maxDrawdown1yPct: 18.5,
  parsedFees: { management_pct: 1.2, custody_pct: 0.2 },
};

describe("normalizeReportEchartsOption", () => {
  it("adds spacing for pie charts with title subtext", () => {
    const raw = buildAssetPieChart(BASE_INPUT);
    expect(raw).not.toBeNull();
    const normalized = normalizeReportEchartsOption(raw!);
    const series = normalized.series as Array<Record<string, unknown>>;

    expect((normalized.title as Record<string, unknown>).top).toBe(8);
    expect(series[0]?.avoidLabelOverlap).toBe(true);
    expect(series[0]?.center).toEqual(["50%", "58%"]);
  });

  it("skips asset pie when allocation data is missing", () => {
    expect(buildAssetPieChart({ ...BASE_INPUT, assetAllocation: undefined })).toBeNull();
  });

  it("injects grid and axis margins for bar charts", () => {
    const raw = buildReturnCompareBarChart(BASE_INPUT);
    expect(raw).not.toBeNull();
    const normalized = normalizeReportEchartsOption(raw!);
    const grid = normalized.grid as Record<string, unknown>;
    const xAxis = asRecord(normalized.xAxis);
    const yAxis = asRecord(normalized.yAxis);

    expect(grid.containLabel).toBe(true);
    expect(grid.top).toBeGreaterThanOrEqual(72);
    expect(grid.bottom).toBeGreaterThanOrEqual(40);
    expect(asRecord(xAxis?.axisLabel)).toMatchObject({ hideOverlap: true });
    expect(asRecord(yAxis?.axisLabel)).toMatchObject({ hideOverlap: true });
  });

  it("return compare chart requires both fund and benchmark returns", () => {
    expect(buildReturnCompareBarChart({ ...BASE_INPUT, benchmarkReturn1yPct: undefined })).toBeNull();
  });

  it("assigns reasonable height for bar charts", () => {
    const raw = buildReturnCompareBarChart(BASE_INPUT);
    expect(resolveReportChartHeight(raw!)).toBeGreaterThanOrEqual(400);
  });
});

describe("fund echarts layout audit", () => {
  it("skeleton charts with real inputs pass layout normalization", () => {
    const builders = [
      () => buildAssetPieChart(BASE_INPUT),
      () => buildHoldingsBarChart(BASE_INPUT),
      () => buildReturnCompareBarChart(BASE_INPUT),
      () => buildFeeCompareBarChart(BASE_INPUT.parsedFees),
    ];

    for (const build of builders) {
      const raw = build();
      if (!raw) continue;
      const normalized = normalizeReportEchartsOption(raw);
      const height = resolveReportChartHeight(normalized);

      expect(height).toBeGreaterThanOrEqual(400);

      const seriesTypes = (normalized.series as Array<Record<string, unknown>>).map(
        (s) => s.type,
      );
      const isCartesian = seriesTypes.some((t) => t === "line" || t === "bar");
      if (isCartesian) {
        const grid = normalized.grid as Record<string, unknown>;
        expect(grid.containLabel).toBe(true);
        expect(grid.top).toBeGreaterThanOrEqual(72);
        expect(grid.bottom).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it("full report markdown only includes charts backed by L0 data", () => {
    const withData = buildFundReportEchartsMarkdown({
      fundCode: "019305",
      fundName: "样例 QDII 基金",
      archetype: "A",
      return1yPct: 15.2,
      benchmarkReturn1yPct: 12.1,
      benchmarkName: "沪深300",
      assetAllocation: { stock_pct: 92, bond_pct: 4, cash_pct: 4 },
      parsedFees: { management_pct: 0.8 },
    });
    expect(withData.chartCount).toBeGreaterThanOrEqual(2);

    const sparse = buildFundReportEchartsMarkdown({
      fundCode: "019305",
      fundName: "样例 QDII 基金",
      archetype: "A",
    });
    expect(sparse.chartCount).toBe(0);
  });
});
