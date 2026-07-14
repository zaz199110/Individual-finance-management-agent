/**
 * 股票型基金模板 冒烟测试
 * 验证模板在各种参数组合下不会崩溃，并产生有效的 Markdown 输出。
 * 不依赖数据库、网络或 LLM。
 */
import { describe, it, expect } from "vitest";
import { buildStockFundReportMarkdown } from "./stock-fund.template";
import type { StockFundParams } from "./stock-fund.template";

const MINIMAL_PARAMS: StockFundParams = {
  fundCode: "161130",
  fundName: "纳指ETF联接(QDII)",
  riskLevel: "中高风险",
  navDate: "2026-06-25",
  ymd: "2026-06-25",
  dateLabel: "2026年06月25日",
  referenceChapter: "### 参考文档\n\n- 161130 季报（2026Q1）",
};

describe("buildStockFundReportMarkdown — smoke", () => {
  it("produces non-empty markdown with minimal params", () => {
    const result = buildStockFundReportMarkdown(MINIMAL_PARAMS);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(200);
    expect(result.chartCount).toBeGreaterThanOrEqual(0);
  });

  it("includes all mandatory chapter headings", () => {
    const { markdown } = buildStockFundReportMarkdown(MINIMAL_PARAMS);
    // Chapters always present (Ch3=投资范围 is optional and skipped here):
    expect(markdown).toMatch(/产品介绍/);
    expect(markdown).toMatch(/基金经理/);
    expect(markdown).toMatch(/费率结构/);
    expect(markdown).toMatch(/前十大重仓/);
    expect(markdown).toMatch(/持仓资产比例/);
    expect(markdown).toMatch(/温馨提示/);
    expect(markdown).toMatch(/参考文档/);
  });

  it("skips Ch3 (投资范围) when scopeExcerpt is missing", () => {
    const { markdown } = buildStockFundReportMarkdown(MINIMAL_PARAMS);
    expect(markdown).not.toMatch(/投资范围/);
    // 费率结构 becomes Ch3 (renumbered)
    expect(markdown).toContain("## 3. 费率结构");
  });

  it("includes Ch3 (投资范围) when scopeExcerpt is provided", () => {
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      scopeExcerpt: "跟踪纳斯达克100指数",
    };
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown).toMatch(/投资范围/);
  });

  it("renders identity fields in Ch1 (产品介绍)", () => {
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      fundCode: "161130",
      fundName: "广发纳指ETF联接",
      typeLabel: "QDII-股票型",
      riskLevel: "中高风险",
      management: "广发基金管理有限公司",
      custodian: "中国银行",
      foundDate: "2012-08-15",
      aumYi: 48.5,
      aumDate: "2026-03-31",
      minAmount: 0.01,
      return1yPct: 25.3,
      maxDrawdown1yPct: -12.8,
      benchmarkName: "纳斯达克100指数",
    };
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown).toContain("161130");
    expect(markdown).toContain("广发纳指ETF联接");
    expect(markdown).toContain("QDII-股票型");
    expect(markdown).toContain("广发基金管理有限公司");
    expect(markdown).toContain("中国银行");
    expect(markdown).toContain("2012-08-15");
    expect(markdown).toContain("48.5");
    expect(markdown).toContain("25.3");
    expect(markdown).toContain("纳斯达克100指数");
  });

  it("shows fallback placeholders for missing optional chapters", () => {
    const { markdown } = buildStockFundReportMarkdown(MINIMAL_PARAMS);
    // Chapters that always exist and show "暂无…" when data is missing
    const noDataPatterns = [
      /暂无费率数据/,
      /暂无前十大重仓数据/,
      /暂无大类资产配置数据/,
    ];
    for (const p of noDataPatterns) {
      expect(markdown).toMatch(p);
    }
  });

  it("renders echarts JSON when asset allocation is provided", () => {
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      assetAllocation: {
        items: [
          { name: "股票", pct: 85.2 },
          { name: "债券", pct: 5.3 },
          { name: "现金", pct: 9.5 },
        ],
        asOfDate: "2026-03-31",
      },
    };
    const { markdown, chartCount } = buildStockFundReportMarkdown(params);
    expect(chartCount).toBeGreaterThanOrEqual(1);
    // ECharts JSON should be present (echarts block marker)
    expect(markdown).toMatch(/echarts/);
  });

  it("renders top holdings table with name, code, market value", () => {
    // L0TopHolding uses: name, code (optional), weight_pct, market_value
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      topHoldings: [
        { name: "Apple Inc.", code: "AAPL", weight_pct: 9.2, asset_type: "stock", market_value: 920000000 },
        { name: "Microsoft Corp.", code: "MSFT", weight_pct: 8.1, asset_type: "stock", market_value: 810000000 },
        { name: "NVIDIA Corp.", code: "NVDA", weight_pct: 7.3, asset_type: "stock", market_value: 730000000 },
      ],
    };
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown).toContain("Apple Inc.");
    expect(markdown).toContain("Microsoft Corp.");
    // code appears in parens: Apple Inc.（AAPL）
    expect(markdown).toContain("（AAPL）");
    // market_value rendered as 万元
    expect(markdown).toContain("92000.00 万元");
  });

  it("renders fee table with all fee types", () => {
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      managementFee: 0.6,
      custodyFee: 0.2,
      subscriptionMax: "1.2%",
      purchaseMax: "1.5%",
      redemptionMax: "0.5% (<7天)",
      salesServiceFee: 0.25,
    };
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown).toContain("0.6%");
    expect(markdown).toContain("0.2%");
    expect(markdown).toContain("1.2%");
    expect(markdown).toContain("1.5%");
    expect(markdown).toContain("销售服务费");
    expect(markdown).toContain("0.25%");
  });

  it("handles L0FundManagerRecord array with name/begin_date/end_date", () => {
    // L0FundManagerRecord fields: name, begin_date?, end_date?
    const params: StockFundParams = {
      ...MINIMAL_PARAMS,
      fundManagers: [
        { name: "张三", begin_date: "2020-01-01" },
        { name: "李四", begin_date: "2023-06-15" },
      ],
    };
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown).toContain("张三");
    expect(markdown).toContain("李四");
    expect(markdown).toContain("2020-01-01");
  });

  it("does not crash with empty params (all optional fields undefined)", () => {
    const params: StockFundParams = {
      fundCode: "000000",
      fundName: "测试基金",
      riskLevel: "低风险",
      navDate: "2026-01-01",
      ymd: "2026-01-01",
      dateLabel: "2026年01月01日",
      referenceChapter: "",
    };
    expect(() => buildStockFundReportMarkdown(params)).not.toThrow();
    const { markdown } = buildStockFundReportMarkdown(params);
    expect(markdown.length).toBeGreaterThan(100);
  });

  it("returns consistent chartCount", () => {
    // Without allocation: 0 charts
    const r1 = buildStockFundReportMarkdown(MINIMAL_PARAMS);
    expect(r1.chartCount).toBe(0);

    // With allocation: at least 1 chart (pie)
    const r2 = buildStockFundReportMarkdown({
      ...MINIMAL_PARAMS,
      assetAllocation: {
        items: [{ name: "股票", pct: 90 }],
        asOfDate: "2026-01-01",
      },
    });
    expect(r2.chartCount).toBeGreaterThanOrEqual(1);
  });
});
