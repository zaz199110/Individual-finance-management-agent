import { describe, expect, it } from "vitest";
import {
  buildL1HintsFromL2,
  classifyKbIntent,
  isL0ValidForIntent,
  shouldInvokeL3,
} from "./kb-intent";

describe("kb-intent", () => {
  it("classifies colloquial and news", () => {
    expect(classifyKbIntent("这只基稳不稳")).toBe("colloquial");
    expect(classifyKbIntent("最近有什么新闻")).toBe("news");
  });

  it("validates L0 by intent field groups", () => {
    expect(
      isL0ValidForIntent(
        { ok: true, nav: 1.2, as_of_trade_date: "2026-06-01" },
        "nav",
      ),
    ).toBe(true);
    expect(
      isL0ValidForIntent({ ok: true, nav: 1.2, as_of_trade_date: "2026-06-01" }, "holdings"),
    ).toBe(false);
    expect(
      isL0ValidForIntent(
        { ok: true, top_holdings: [{ code: "AAPL", name: "Apple", asset_type: "stock" as const, weight_pct: 5 }] },
        "holdings",
      ),
    ).toBe(true);
  });

  it("L3 only when primary layer invalid or news intent", () => {
    expect(
      shouldInvokeL3({
        intent: "nav",
        query: "净值多少",
        hasVault: true,
        l0Valid: true,
        l1Valid: false,
        l2Valid: false,
      }),
    ).toBe(false);
    expect(
      shouldInvokeL3({
        intent: "disclosure",
        query: "管理费",
        hasVault: true,
        l0Valid: true,
        l1Valid: false,
        l2Valid: false,
      }),
    ).toBe(true);
  });

  it("builds L1 hints from L2 metadata", () => {
    const hints = buildL1HintsFromL2({
      keywords: ["稳不稳", "风险"],
      suggested_doc_types: ["prospectus"],
    });
    expect(hints.some((h) => h.includes("费率"))).toBe(true);
  });
});
