import { describe, expect, it } from "vitest";
import { exploreFundKnowledge } from "@/harness/infra/fund_knowledge/explore";
import { gatherFundWaterfall } from "@/harness/infra/fund_knowledge/waterfall";

describe("fund knowledge explore", () => {
  it("finds fee-related chunks for 019305", () => {
    const r = exploreFundKnowledge({
      fund_code: "019305",
      query: "管理费 托管费",
      max_hits: 5,
    });
    expect(r.ok).toBe(true);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => /费率|管理|托管/.test(h.excerpt))).toBe(true);
  });

  it("waterfall gathers L0+L1 for vault fund", async () => {
    const r = await gatherFundWaterfall("019305", { skip_l3: true });
    expect(r.ok).toBe(true);
    expect(r.l0_summary).toMatch(/019305/);
    expect(r.l1_hits.length).toBeGreaterThan(0);
  });
});
