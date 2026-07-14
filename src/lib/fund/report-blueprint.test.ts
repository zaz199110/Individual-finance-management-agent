import { describe, expect, it } from "vitest";
import {
  formatAsOfTradeDateLabel,
  referenceEchartsCount,
  resolveAssetAllocationForCharts,
} from "./report-blueprint";

describe("report-blueprint", () => {
  it("formats trade date labels", () => {
    expect(formatAsOfTradeDateLabel("2026-06-13")).toBe("2026-06-13");
    expect(formatAsOfTradeDateLabel("20260613")).toBe("2026-06-13");
    expect(formatAsOfTradeDateLabel(undefined)).toBe("—");
  });

  it("reference echarts count is per-chapter typical (not total cap)", () => {
    expect(referenceEchartsCount("F")).toBe(3);
    expect(referenceEchartsCount("D")).toBe(3);
  });

  it("resolves asset allocation only from quarterly L1 hits", () => {
    const alloc = resolveAssetAllocationForCharts({
      l1Hits: [
        {
          chunk_id: "c1",
          fund_code: "206007",
          doc_type: "quarterly_report",
          file_path: "206007/quarterly_report/2025Q4-quarterly-report.md",
          heading: "资产组合",
          line_start: 24,
          line_end: 30,
          excerpt:
            "## 二、投资组合 — 资产组合\n| 股票 | **88.50%** |\n| 债券 | 6.20% |\n| 银行存款 | 5.30% |",
          score: 1,
          deep_link: "/fund-knowledge?fund=206007",
        },
      ],
    });
    expect(alloc?.stock_pct).toBe(88.5);
    expect(alloc?.bond_pct).toBe(6.2);
  });
});
