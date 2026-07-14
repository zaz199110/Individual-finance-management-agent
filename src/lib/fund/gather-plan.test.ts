import { describe, expect, it } from "vitest";
import { ensureFundKnowledgeVault } from "@/harness/infra/fund_knowledge/bootstrap";
import { syncSeedFundToVault } from "@/harness/infra/fund_knowledge/enrich";
import { predictFullReportNeedsEnrich, predictFullReportNeedsL3 } from "./gather-plan";

describe("predictFullReportNeedsEnrich", () => {
  it("206007 seed 同步后不需要 enrich", () => {
    ensureFundKnowledgeVault();
    syncSeedFundToVault("206007");
    expect(
      predictFullReportNeedsEnrich({ ok: true, fund_code: "206007" }),
    ).toBe(false);
  });
});

describe("predictFullReportNeedsL3", () => {
  it("无 vault 的 C 档基金需要联网", () => {
    expect(
      predictFullReportNeedsL3({
        ok: true,
        fund_code: "206007",
        has_vault: false,
        nav: 1.2,
        as_of_trade_date: "2026-06-13",
        return_1y_pct: 5,
        max_drawdown_1y_pct: -10,
        top_holdings: [],
      }),
    ).toBe(true);
  });

  it("有 vault 且 L0 完整时通常不需要联网", () => {
    expect(
      predictFullReportNeedsL3({
        ok: true,
        fund_code: "019305",
        has_vault: true,
        fund_name: "样例基金",
        fund_type: "混合型",
        risk_level: "中风险",
        nav: 1.5,
        as_of_trade_date: "2026-06-13",
        return_1y_pct: 8,
        max_drawdown_1y_pct: -12,
        top_holdings: [{ name: "A", weight_pct: 5, asset_type: "stock" }],
      }),
    ).toBe(false);
  });
});
