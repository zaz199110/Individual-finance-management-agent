import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/fund/lookup", () => ({
  fundLookupAsync: vi.fn(async () => ({
    ok: true,
    fund_code: "206007",
    fund_name: "鹏华消费优选混合",
    fund_type: "混合型 · 偏股 · 消费",
    risk_level: "R4 · 中高风险",
    has_vault: false,
    lookup_source: "registry_demo",
    l0_degraded: true,
    as_of_trade_date: "2026-06-13",
    nav: 2.156,
    return_1y_pct: 5.8,
    max_drawdown_1y_pct: -18.5,
    top_holdings: [],
  })),
}));

vi.mock("@/harness/tools/web_search", () => ({
  webSearch: vi.fn(async ({ query }: { query: string }) => {
    if (/投资范围/.test(query)) {
      return {
        summary: "投资范围包括国内依法发行上市的股票、债券等金融工具。",
        snippets: [],
        citations: [{ title: "范围来源", url: "https://example.com/scope" }],
        l3_low_confidence: false,
      };
    }
    if (/风险揭示/.test(query)) {
      return {
        summary: "本基金为混合型基金，属于中高风险（R4），可能面临较大波动。",
        snippets: [],
        citations: [{ title: "风险来源", url: "https://example.com/risk" }],
        l3_low_confidence: false,
      };
    }
    if (/管理费|管理费率|托管费率|运作相关费用|产品资料概要/.test(query)) {
      return {
        summary: "管理费 1.20%/年，托管费 0.20%/年，申购费最高 1.50%。",
        snippets: [
          "基金费率：管理费1.20%，托管费0.20%",
          "年管理费率 1.2%，年托管费率 0.2%",
        ],
        citations: [{ title: "费率来源", url: "https://example.com/fee" }],
        l3_low_confidence: false,
      };
    }
    if (/重仓|概况|最新/.test(query)) {
      return {
        summary: "基金主要配置消费板块，重仓食品饮料与可选消费行业龙头。",
        snippets: [],
        citations: [{ title: "持仓来源", url: "https://example.com/hold" }],
        l3_low_confidence: false,
      };
    }
    return { summary: "", snippets: [], citations: [], l3_low_confidence: true };
  }),
}));

describe("gatherFundWaterfall full_report 206007", () => {
  beforeEach(() => {
    delete process.env.HARNESS_SKIP_L3;
  });

  it("fills disclosure from L3 and blocks placeholders", async () => {
    const { gatherFundWaterfall } = await import(
      "@/harness/infra/fund_knowledge/waterfall"
    );
    const r = await gatherFundWaterfall("206007", { purpose: "full_report" });
    expect(r.ok).toBe(true);
    expect(r.fee_excerpt).toMatch(/管理费/);
    expect(r.scope_excerpt).toMatch(/投资范围/);
    expect(r.risk_excerpt).toMatch(/风险/);
    expect(r.holding_cost_estimate).toMatch(/1\.4%/);
    expect(r.skip_holdings_chart).toBe(true);
    expect(r.holdings_excerpt).toMatch(/消费/);
    expect(r.fee_excerpt).not.toMatch(/请查阅/);
  });
});
