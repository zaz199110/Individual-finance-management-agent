import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isFundFullReportIntent,
  isFundRegenerateIntent,
  resolveFundCodeForFullReport,
} from "./report-intent";

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(),
}));

describe("isFundFullReportIntent", () => {
  it("matches full report and regenerate phrases", () => {
    expect(isFundFullReportIntent("出具完整基金解读报告")).toBe(true);
    expect(isFundFullReportIntent("请重新生成报告")).toBe(true);
    expect(isFundFullReportIntent("重新跑一下")).toBe(true);
    expect(isFundFullReportIntent("重跑")).toBe(true);
    expect(isFundFullReportIntent("再跑一遍")).toBe(true);
    expect(isFundFullReportIntent("重新发起解读")).toBe(true);
  });

  it("does not match plain fund qa", () => {
    expect(isFundFullReportIntent("000001管理费多少")).toBe(false);
  });
});

describe("isFundRegenerateIntent", () => {
  it("detects regenerate-only wording", () => {
    expect(isFundRegenerateIntent("重新生成报告")).toBe(true);
    expect(isFundRegenerateIntent("解读报告")).toBe(false);
  });
});

describe("resolveFundCodeForFullReport", () => {
  beforeEach(async () => {
    const { getSupabase } = await import("@/lib/supabase/server");
    vi.mocked(getSupabase).mockReset();
  });

  it("prefers code in user message", async () => {
    await expect(
      resolveFundCodeForFullReport("请重新生成 206007 报告"),
    ).resolves.toBe("206007");
  });

  it("falls back to pending draft fund_code", async () => {
    const { getSupabase } = await import("@/lib/supabase/server");
    vi.mocked(getSupabase).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                metadata: {
                  pending_report_draft: { fund_code: "206007" },
                },
              },
            }),
          }),
        }),
      }),
    } as never);

    await expect(resolveFundCodeForFullReport("重新生成报告", "conv-1")).resolves.toBe(
      "206007",
    );
  });
});
