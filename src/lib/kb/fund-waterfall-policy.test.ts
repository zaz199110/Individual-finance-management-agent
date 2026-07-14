import { describe, expect, it } from "vitest";
import {
  formatHoldingCostEstimate,
  isDisclosurePlaceholder,
  parseFeeRatesFromSnippets,
  parseFeeRatesFromText,
} from "@/lib/kb/disclosure-parse";
import { getL0Gaps, isL0Degraded } from "@/lib/kb/l0-gaps";
import { shouldInvokeL3 } from "@/lib/kb/kb-intent";

describe("disclosure-parse", () => {
  it("detects placeholders", () => {
    expect(isDisclosurePlaceholder("（请查阅招募说明书费率章节）")).toBe(true);
    expect(isDisclosurePlaceholder("管理费 1.2% 托管费 0.2%")).toBe(false);
  });

  it("parses fee rates from text", () => {
    const rates = parseFeeRatesFromText("管理费 1.20%/年，托管费 0.20%/年");
    expect(rates.management_pct).toBe(1.2);
    expect(rates.custody_pct).toBe(0.2);
    expect(formatHoldingCostEstimate(rates)).toMatch(/1\.4%/);
  });

  it("merges fee rates from multiple truncated snippets", () => {
    const rates = parseFeeRatesFromSnippets([
      "| 管理费 | **0.20%** / 年 |",
      "| 托管费 | **0.05%** / 年 |",
    ]);
    expect(rates.management_pct).toBe(0.2);
    expect(rates.custody_pct).toBe(0.05);
    expect(formatHoldingCostEstimate(rates)).toMatch(/0\.25%/);
  });

  it("parses prospectus long-form fee sentences", () => {
    const rates = parseFeeRatesFromText(
      "本基金的管理费按前一自然日基金资产净值的0.50%年费率计提。本基金的托管费按前一自然日基金资产净值的0.15%的年费率计提。",
    );
    expect(rates.management_pct).toBe(0.5);
    expect(rates.custody_pct).toBe(0.15);
  });

  it("parses multiline product summary fee table", () => {
    const rates = parseFeeRatesFromText("管理费  0.5%  托管费  0.15%");
    expect(rates.management_pct).toBe(0.5);
    expect(rates.custody_pct).toBe(0.15);
  });
});

describe("l0-gaps", () => {
  it("flags holdings gap for full report", () => {
    const gaps = getL0Gaps(
      {
        ok: true,
        fund_name: "测试",
        fund_type: "混合型",
        risk_level: "R4",
        nav: 1.2,
        as_of_trade_date: "2026-06-01",
        return_1y_pct: 5,
        max_drawdown_1y_pct: -10,
        top_holdings: [],
      },
      "full_report",
      "D",
    );
    expect(gaps).toContain("holdings");
  });

  it("skips holdings gap for money market funds", () => {
    const gaps = getL0Gaps(
      {
        ok: true,
        fund_name: "天弘余额宝货币",
        fund_type: "货币型",
        risk_level: "R1",
        nav: 1,
        as_of_trade_date: "2026-06-01",
        return_1y_pct: 1.9,
        max_drawdown_1y_pct: 0,
        top_holdings: [],
      },
      "full_report",
      "B",
    );
    expect(gaps).not.toContain("holdings");
  });

  it("treats registry demo as degraded", () => {
    expect(isL0Degraded({ lookup_source: "registry_demo" })).toBe(true);
  });
});

describe("shouldInvokeL3 full_report", () => {
  it("invokes L3 for no vault full report", () => {
    expect(
      shouldInvokeL3({
        intent: "general",
        query: "基金解读",
        hasVault: false,
        l0Valid: true,
        l1Valid: false,
        l2Valid: false,
        purpose: "full_report",
        needsDisclosureL3: true,
      }),
    ).toBe(true);
  });

  it("skips L3 for vault fund with complete L0 on nav qa", () => {
    expect(
      shouldInvokeL3({
        intent: "nav",
        query: "净值",
        hasVault: true,
        l0Valid: true,
        l1Valid: true,
        l2Valid: false,
        purpose: "qa",
        l0Gaps: [],
      }),
    ).toBe(false);
  });
});
