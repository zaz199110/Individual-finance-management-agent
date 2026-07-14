import { describe, expect, it } from "vitest";
import {
  isL0StructuredHoldingsBody,
  isVaultSourcedExcerptBody,
  shouldConsiderRefine,
} from "./report-fund-refine";

describe("report-fund-refine section scope", () => {
  it("detects vault excerpt marker", () => {
    expect(
      isVaultSourcedExcerptBody(
        "*本段数据截止 **2026-06-12**（来源报告发布时间）*\n\n费率…",
      ),
    ).toBe(true);
  });

  it("skips L0 structured holdings unless table is broken", () => {
    const body = `
| 序号 | 重仓标的 | 占净值比例 |
|------|----------|------------|
| 1 | 贵州茅台 | **9.82%** |
`.trim();
    expect(isL0StructuredHoldingsBody(body)).toBe(true);
    expect(shouldConsiderRefine("投向与重仓", body)).toBe(false);
  });

  it("always considers vault disclosure sections for refine, even when short", () => {
    const body = `*本段数据截止 **2026-06-12**（来源报告发布时间）*

本基金主要投资于消费行业优质上市公司。`;
    expect(shouldConsiderRefine("投资范围", body)).toBe(true);
  });

  it("considers vault disclosure sections for refine when pasted long", () => {
    const body = `*本段数据截止 **2026-06-12**（来源报告发布时间）*

${"本基金主要投资于消费行业。".repeat(40)}`;
    expect(shouldConsiderRefine("投资范围", body)).toBe(true);
  });
});
