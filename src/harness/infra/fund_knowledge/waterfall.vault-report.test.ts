import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/harness/tools/web_search", () => ({
  webSearch: vi.fn(async ({ query }: { query: string }) => {
    if (/重仓|概况|最新|同业存单|行业/.test(query)) {
      return {
        summary:
          "基金主要配置同业存单 AAA 品种，久期较短，适合作为短期闲置资金的稳健配置工具，季报披露行业以金融工具为主。",
        snippets: [],
        citations: [{ title: "持仓来源", url: "https://example.com/hold" }],
        l3_low_confidence: false,
      };
    }
    return { summary: "", snippets: [], citations: [], l3_low_confidence: true };
  }),
}));

describe("gatherFundWaterfall full_report vault funds", () => {
  beforeEach(() => {
    delete process.env.HARNESS_SKIP_L3;
  });

  it("017704 merges fees from multiple L1 chunks", async () => {
    const { gatherFundWaterfall } = await import(
      "@/harness/infra/fund_knowledge/waterfall"
    );
    const r = await gatherFundWaterfall("017704", { purpose: "full_report" });
    expect(r.error, r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.parsed_fees.management_pct).toBe(0.2);
    expect(r.parsed_fees.custody_pct).toBe(0.05);
    expect(r.holding_cost_estimate).toMatch(/0\.45%/);
  });

  it("019305 parses fees from prospectus long-form vault text", async () => {
    const { gatherFundWaterfall } = await import(
      "@/harness/infra/fund_knowledge/waterfall"
    );
    const r = await gatherFundWaterfall("019305", { purpose: "full_report" });
    expect(r.error, r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.parsed_fees.management_pct).toBe(0.5);
    expect(r.parsed_fees.custody_pct).toBe(0.15);
    expect(r.holding_cost_estimate).toMatch(/0\.95%/);
  });
});
