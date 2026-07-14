import { describe, it, expect } from "vitest";
import { softCheckDetail } from "./detail-propose";
import type { L0Candidate, DetailResponse, SoftCheckWarning } from "./detail-propose";
import type { WealthGrowthConstraints } from "@/lib/profile/types";

// Helper: minimal valid DetailResponse
function makeCategory(
  category: string,
  items: Array<{
    fund_code: string;
    fund_name: string;
    weight_in_category: number;
    role_label: string;
  }>,
): DetailResponse["categories"][number] {
  return {
    category,
    structure_note: "",
    items: items.map((i) => ({
      ...i,
      recommendation_reason: "测试推荐",
    })),
  } as DetailResponse["categories"][number];
}

// Helper: minimal L0 map
function makeL0Map(funds: Array<{ fund_code: string; fund_name: string }>): Map<string, L0Candidate> {
  const m = new Map<string, L0Candidate>();
  for (const f of funds) {
    m.set(f.fund_code, {
      fund_code: f.fund_code,
      fund_name: f.fund_name,
      fund_type: "股票型",
      risk_level: 3,
      archetype: "equity",
      is_qdii: false,
      nav_date: "20260101",
    } as L0Candidate);
  }
  return m;
}

// Helper: minimal constraints
function makeConstraints(overrides: Partial<WealthGrowthConstraints> = {}): WealthGrowthConstraints {
  return {
    risk_tolerance: "平衡",
    goal_type: "wealth_growth",
    investment_duration: "3-5年",
    ...overrides,
  } as WealthGrowthConstraints;
}

describe("softCheckDetail", () => {
  it("passes clean portfolio (3 funds, 2 companies, diverse roles)", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 60, role_label: "宽基" },
          { fund_code: "166006", fund_name: "中欧时代先锋股票A", weight_in_category: 40, role_label: "主动混合" },
        ]),
        makeCategory("货币类", [
          { fund_code: "000198", fund_name: "天弘余额宝货币", weight_in_category: 100, role_label: "流动性储备" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "166006", fund_name: "中欧时代先锋股票A" },
      { fund_code: "000198", fund_name: "天弘余额宝货币" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    expect(warnings.length).toBe(0);
  });

  it("warns when too few funds (<2)", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("货币类", [
          { fund_code: "000198", fund_name: "天弘余额宝货币", weight_in_category: 100, role_label: "流动性储备" },
        ]),
      ],
    };
    const l0Map = makeL0Map([{ fund_code: "000198", fund_name: "天弘余额宝货币" }]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints({ risk_tolerance: "保守" }));
    expect(warnings.some((w) => w.rule === "数量下限")).toBe(true);
  });

  it("warns when too many funds (>8)", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 20, role_label: "宽基" },
          { fund_code: "166006", fund_name: "中欧时代先锋股票A", weight_in_category: 20, role_label: "主动混合" },
          { fund_code: "000001", fund_name: "华夏成长混合", weight_in_category: 20, role_label: "主动混合" },
          { fund_code: "000002", fund_name: "博时主题行业混合", weight_in_category: 20, role_label: "主动混合" },
          { fund_code: "000003", fund_name: "广发稳健增长混合A", weight_in_category: 20, role_label: "主动混合" },
        ]),
        makeCategory("债券类", [
          { fund_code: "000004", fund_name: "招商产业债券A", weight_in_category: 50, role_label: "纯债" },
          { fund_code: "000005", fund_name: "南方宝元债券A", weight_in_category: 50, role_label: "混合债" },
        ]),
        makeCategory("货币类", [
          { fund_code: "000198", fund_name: "天弘余额宝货币", weight_in_category: 100, role_label: "流动性储备" },
        ]),
        makeCategory("其他类", [
          { fund_code: "000006", fund_name: "华安黄金ETF联接A", weight_in_category: 100, role_label: "另类" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "166006", fund_name: "中欧时代先锋股票A" },
      { fund_code: "000001", fund_name: "华夏成长混合" },
      { fund_code: "000002", fund_name: "博时主题行业混合" },
      { fund_code: "000003", fund_name: "广发稳健增长混合A" },
      { fund_code: "000004", fund_name: "招商产业债券A" },
      { fund_code: "000005", fund_name: "南方宝元债券A" },
      { fund_code: "000198", fund_name: "天弘余额宝货币" },
      { fund_code: "000006", fund_name: "华安黄金ETF联接A" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    expect(warnings.some((w) => w.rule === "数量上限")).toBe(true);
  });

  it("warns on single-fund concentration >40%", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 100, role_label: "宽基" },
        ]),
        makeCategory("债券类", [
          { fund_code: "000004", fund_name: "招商产业债券A", weight_in_category: 100, role_label: "纯债" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "000004", fund_name: "招商产业债券A" },
    ]);
    // weight_in_category=100 each, totalAlloc=200, each is 50% -- both >40%
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    expect(warnings.filter((w) => w.rule === "集中度").length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn concentration on 货币类 even at 100%", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("货币类", [
          { fund_code: "000198", fund_name: "天弘余额宝货币", weight_in_category: 100, role_label: "流动性储备" },
        ]),
        makeCategory("债券类", [
          { fund_code: "000004", fund_name: "招商产业债券A", weight_in_category: 100, role_label: "纯债" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "000198", fund_name: "天弘余额宝货币" },
      { fund_code: "000004", fund_name: "招商产业债券A" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    // Only the non-货币 fund triggers concentration warning
    const concWarnings = warnings.filter((w) => w.rule === "集中度");
    expect(concWarnings.length).toBe(1);
    expect(concWarnings[0].detail).toContain("招商");
    expect(concWarnings[0].detail).not.toContain("天弘");
  });

  it("warns when all funds from same company", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 60, role_label: "宽基" },
          { fund_code: "110022", fund_name: "易方达消费行业股票", weight_in_category: 40, role_label: "行业主题" },
        ]),
        makeCategory("债券类", [
          { fund_code: "110037", fund_name: "易方达纯债债券A", weight_in_category: 100, role_label: "纯债" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "110022", fund_name: "易方达消费行业股票" },
      { fund_code: "110037", fund_name: "易方达纯债债券A" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    expect(warnings.some((w) => w.rule === "公司分散")).toBe(true);
  });

  it("warns when stock roles are all same", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 40, role_label: "宽基" },
          { fund_code: "000001", fund_name: "华夏沪深300ETF联接A", weight_in_category: 30, role_label: "宽基" },
          { fund_code: "000002", fund_name: "博时沪深300指数A", weight_in_category: 30, role_label: "宽基" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "000001", fund_name: "华夏沪深300ETF联接A" },
      { fund_code: "000002", fund_name: "博时沪深300指数A" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    const roleWarnings = warnings.filter((w) => w.rule === "角色分散");
    expect(roleWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn role diversity when roles differ", () => {
    const parsed: DetailResponse = {
      categories: [
        makeCategory("股票类", [
          { fund_code: "110011", fund_name: "易方达沪深300ETF联接A", weight_in_category: 50, role_label: "宽基" },
          { fund_code: "166006", fund_name: "中欧时代先锋股票A", weight_in_category: 30, role_label: "主动混合" },
          { fund_code: "000003", fund_name: "天弘中证科技100指数A", weight_in_category: 20, role_label: "行业主题" },
        ]),
      ],
    };
    const l0Map = makeL0Map([
      { fund_code: "110011", fund_name: "易方达沪深300ETF联接A" },
      { fund_code: "166006", fund_name: "中欧时代先锋股票A" },
      { fund_code: "000003", fund_name: "天弘中证科技100指数A" },
    ]);
    const warnings = softCheckDetail(parsed, l0Map, makeConstraints());
    const roleWarnings = warnings.filter((w) => w.rule === "角色分散");
    expect(roleWarnings.length).toBe(0);
  });
});
