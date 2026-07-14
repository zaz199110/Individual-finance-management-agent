import { describe, expect, it } from "vitest";
import {
  buildDraftPreviewUrl,
  extractRunIdFromDraftPath,
  isLatestReportPublishCard,
  previewTargetFromCard,
  previewTargetKey,
  reportCardKey,
} from "./report-publish-card";
import type { ReportPublishCardBlock } from "@/components/chat/types";

const fundCard = (filePath: string): ReportPublishCardBlock => ({
  type: "report_publish_card",
  status: "active",
  report_type: "fund",
  fund_code: "206007",
  report_name: "206007-解读",
  file_path: filePath,
});

describe("reportCardKey", () => {
  it("uses fund_code for fund reports", () => {
    expect(reportCardKey(fundCard("/a"))).toBe("fund:206007");
  });
});

describe("extractRunIdFromDraftPath", () => {
  it("parses run id from posix path", () => {
    expect(
      extractRunIdFromDraftPath(
        "data/runs/conv-1/abc123def4567890/draft-report.md",
      ),
    ).toBe("abc123def4567890");
  });

  it("parses run id from windows path", () => {
    expect(
      extractRunIdFromDraftPath(
        "data\\runs\\conv-1\\abc123def4567890\\draft-report.md",
      ),
    ).toBe("abc123def4567890");
  });
});

describe("isLatestReportPublishCard", () => {
  it("marks matching file_path as latest", () => {
    const path = "data/runs/c/r1/draft-report.md";
    expect(isLatestReportPublishCard(fundCard(path), path)).toBe(true);
  });

  it("marks older file_path as not latest", () => {
    expect(
      isLatestReportPublishCard(
        fundCard("data/runs/c/r1/draft-report.md"),
        "data/runs/c/r2/draft-report.md",
      ),
    ).toBe(false);
  });
});

describe("previewTargetFromCard", () => {
  it("includes run_id parsed from file_path", () => {
    const path = "data/runs/c/run001/draft-report.md";
    expect(previewTargetFromCard(fundCard(path))).toEqual({
      run_id: "run001",
      file_path: path,
      report_name: "206007-解读",
    });
  });
});

describe("buildDraftPreviewUrl", () => {
  it("builds query for run and file path", () => {
    const url = buildDraftPreviewUrl("conv-1", {
      run_id: "run001",
      file_path: "data/runs/c/run001/draft-report.md",
    });
    expect(url).toContain("/api/conversations/conv-1/draft?");
    expect(url).toContain("run_id=run001");
    expect(url).toContain("file_path=");
  });
});

describe("previewTargetKey", () => {
  it("prefers file_path over run_id", () => {
    expect(
      previewTargetKey({
        run_id: "a",
        file_path: "data/runs/c/a/draft-report.md",
      }),
    ).toBe("data/runs/c/a/draft-report.md");
  });
});
