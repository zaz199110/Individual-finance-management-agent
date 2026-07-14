import { describe, expect, it } from "vitest";
import { screenFundsForCategory } from "@/lib/plan/screen-funds";

describe("screenFundsForCategory", () => {
  it("returns stock candidates without commodity", async () => {
    const list = await screenFundsForCategory({ category: "股票类" });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((f) => !/商品|黄金/.test(f.fund_type))).toBe(true);
    expect(list.every((f) => /^\d{6}$/.test(f.fund_code))).toBe(true);
  });

  it("excludes QDII when disabled", async () => {
    const list = await screenFundsForCategory({
      category: "股票类",
      allow_qdii: false,
    });
    expect(list.every((f) => !f.is_qdii)).toBe(true);
  });
});
