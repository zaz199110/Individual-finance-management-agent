import { describe, expect, it } from "vitest";
import { loadSamplePlanDetail } from "@/lib/plan/samples";
import { L0_STUB_FUND_CODES, validateL0StubFunds } from "@/lib/plan/detail-builder";
import { buildPortfolioPlaceholder } from "@/lib/portfolio/placeholder";

describe("validateL0StubFunds", () => {
  it("accepts sample detail funds", () => {
    const r = validateL0StubFunds(loadSamplePlanDetail());
    expect(r.ok).toBe(true);
  });

  it("rejects invalid fund code format", () => {
    const payload = loadSamplePlanDetail();
    const cats = (payload.detailed_plan as { categories: Array<{ items: Array<{ fund_code: string }> }> })
      .categories;
    cats[0]!.items[0]!.fund_code = "1234";
    const r = validateL0StubFunds(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/格式无效/);
  });

  it("accepts valid 6-digit code even if not in pool (live API path)", () => {
    const payload = loadSamplePlanDetail();
    const cats = (payload.detailed_plan as { categories: Array<{ items: Array<{ fund_code: string }> }> })
      .categories;
    cats[0]!.items[0]!.fund_code = "519736";
    const r = validateL0StubFunds(payload);
    expect(r.ok).toBe(true);
  });

  it("stub pool covers sample codes", () => {
    const payload = loadSamplePlanDetail();
    const cats = (payload.detailed_plan as { categories: Array<{ items: Array<{ fund_code: string }> }> })
      .categories;
    for (const cat of cats) {
      for (const item of cat.items) {
        expect(L0_STUB_FUND_CODES.has(item.fund_code)).toBe(true);
      }
    }
  });
});

describe("buildPortfolioPlaceholder", () => {
  it("empty branch", () => {
    const p = buildPortfolioPlaceholder({
      has_current: false,
      position_count: 0,
      confirmed_at: null,
      total_cost: 0,
    });
    expect(p.branch).toBe("empty");
    expect(p.title).toBe("录入持仓");
  });

  it("has holdings branch", () => {
    const p = buildPortfolioPlaceholder({
      has_current: true,
      position_count: 3,
      confirmed_at: "2026-01-01T00:00:00Z",
      total_cost: 88000,
    });
    expect(p.branch).toBe("has_holdings");
    expect(p.empty_body).toMatch(/3.*只基金/);
  });
});
