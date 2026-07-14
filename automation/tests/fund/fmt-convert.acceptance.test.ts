import { describe, expect, it } from "vitest";
import {
  convertSpreadsheetToMarkdown,
  FK_FMT_EXTENSIONS,
  isFkFmtExtension,
} from "@/harness/infra/fund_knowledge/fmt-convert";

describe("FK-FMT spreadsheet convert", () => {
  it("accepts FK-FMT-01 extension set", () => {
    expect(FK_FMT_EXTENSIONS).toContain(".xlsx");
    expect(FK_FMT_EXTENSIONS).toContain(".csv");
    expect(FK_FMT_EXTENSIONS).toContain(".png");
    expect(FK_FMT_EXTENSIONS).toContain(".docx");
    expect(isFkFmtExtension(".XLSX")).toBe(true);
    expect(isFkFmtExtension(".html")).toBe(false);
  });

  it("converts CSV buffer to markdown table", () => {
    const csv = Buffer.from("名称,权重\n苹果,7.2\n微软,6.8\n", "utf8");
    const result = convertSpreadsheetToMarkdown(csv, ".csv", "holdings.csv");
    expect(result.ok).toBe(true);
    expect(result.markdown).toContain("| 名称 | 权重 |");
    expect(result.markdown).toContain("苹果");
    expect(result.conversion_method).toBe("text");
  });
});
