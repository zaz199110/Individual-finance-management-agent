import { describe, expect, it } from "vitest";
import { buildPortfolioReportName } from "./portfolio-report-name";

describe("buildPortfolioReportName", () => {
  it("returns 持仓分析报告 with explicit ymd", () => {
    expect(
      buildPortfolioReportName({ ymd: "20260615" }),
    ).toBe("持仓分析报告-20260615");
  });

  it("uses today's date when ymd is omitted", () => {
    const result = buildPortfolioReportName({});
    expect(result).toMatch(/^持仓分析报告-\d{8}$/);
  });
});
