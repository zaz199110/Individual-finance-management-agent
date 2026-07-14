import { describe, expect, it } from "vitest";
import { DEMO_FUND_CODE, fundLookup, resolveFundCode } from "@/lib/fund/lookup";

describe("fundLookup", () => {
  it("resolves demo fund", () => {
    const r = fundLookup({ fund_code: DEMO_FUND_CODE });
    expect(r.ok).toBe(true);
    expect(r.fund_name).toMatch(/标普500/);
  });

  it("rejects unknown code", () => {
    const r = fundLookup({ fund_code: "999999" });
    expect(r.ok).toBe(false);
  });

  it("extracts code from message", () => {
    expect(resolveFundCode("019305 管理费多少")).toBe("019305");
  });
});
