import { describe, expect, it, vi, beforeEach } from "vitest";

const semanticSearchFundKnowledgeAsyncMock = vi.fn();

vi.mock("./semantic", () => ({
  semanticSearchFundKnowledgeAsync: (...args: unknown[]) =>
    semanticSearchFundKnowledgeAsyncMock(...args),
}));

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
    if (/管理费|管理费率|托管费率|运作相关费用/.test(query)) {
      return {
        summary: "管理费 1.20%/年，托管费 0.20%/年。",
        snippets: ["管理费1.20%，托管费0.20%"],
        citations: [{ title: "费率来源", url: "https://example.com/fee" }],
        l3_low_confidence: false,
      };
    }
    if (/投资范围/.test(query)) {
      return {
        summary: "本基金投资范围包括国内依法发行上市的股票、债券及其他金融工具。",
        snippets: ["投资范围包括国内依法发行上市的股票、债券等，以及法律法规允许的其他投资品种。"],
        citations: [{ title: "范围来源", url: "https://example.com/scope" }],
        l3_low_confidence: false,
      };
    }
    if (/风险揭示/.test(query)) {
      return {
        summary: "本基金为混合型基金，属于中高风险（R4），适合风险承受能力较高的投资者。",
        snippets: ["本基金为混合型基金，属于中高风险（R4）。"],
        citations: [{ title: "风险来源", url: "https://example.com/risk" }],
        l3_low_confidence: false,
      };
    }
    if (/重仓|概况|最新/.test(query)) {
      return {
        summary: "该基金主要配置消费板块，重仓持有食品饮料、家电等龙头企业。",
        snippets: ["基金主要配置消费板块，前十大重仓股涵盖白酒、家电、食品等行业优质标的。"],
        citations: [{ title: "持仓来源", url: "https://example.com/hold" }],
        l3_low_confidence: false,
      };
    }
    return { summary: "", snippets: [], citations: [], l3_low_confidence: true };
  }),
}));

describe("gatherFundWaterfall skipL2", () => {
  beforeEach(() => {
    semanticSearchFundKnowledgeAsyncMock.mockReset();
  });

  it("skip_l2 option prevents semantic search call", async () => {
    const { gatherFundWaterfall } = await import(
      "@/harness/infra/fund_knowledge/waterfall"
    );
    const r = await gatherFundWaterfall("206007", {
      purpose: "full_report",
      skip_l2: true,
    });

    // Semantic search should NOT have been called
    expect(semanticSearchFundKnowledgeAsyncMock).not.toHaveBeenCalled();
    
    // Result should still be valid (L0 → L3 path works)
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.fee_excerpt).toMatch(/管理费/);
  });

  it("HARNESS_SKIP_L2=1 env var prevents semantic search call", async () => {
    process.env.HARNESS_SKIP_L2 = "1";
    
    const { gatherFundWaterfall } = await import(
      "@/harness/infra/fund_knowledge/waterfall"
    );
    const r = await gatherFundWaterfall("206007", { purpose: "full_report" });

    // Semantic search should NOT have been called
    expect(semanticSearchFundKnowledgeAsyncMock).not.toHaveBeenCalled();
    
    // Result should still be valid
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    
    delete process.env.HARNESS_SKIP_L2;
  });
});
