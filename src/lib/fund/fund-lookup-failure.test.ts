import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/l0/fetch-fund-l0", () => ({
  fetchLiveFundL0: vi.fn(async () => null),
}));

describe("fundLookupAsync failure", () => {
  it("returns error when live L0 unavailable", async () => {
    const { fundLookupAsync } = await import("./lookup");
    const r = await fundLookupAsync({ fund_code: "999999" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Tushare|AKShare/);
  });
});
