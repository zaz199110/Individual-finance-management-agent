import { describe, expect, it } from "vitest";
import { buildUsageGuide } from "@/lib/usage/build-usage-guide";

describe("usage guide (customer-facing)", () => {
  it("builds overview and five scene pages", () => {
    const guide = buildUsageGuide();
    expect(guide.scenes).toHaveLength(5);
    expect(guide.overview.capabilities).toHaveLength(4);
    expect(guide.overview.intro).toMatch(/理财助手/);
  });

  it("uses PRD §5.7.2 capability themes without internal jargon", () => {
    const guide = buildUsageGuide();
    const text = JSON.stringify(guide);
    expect(text).toMatch(/投资规划/);
    expect(text).toMatch(/审慎决策/);
    expect(text).not.toMatch(/registry\.yaml|Harness|写库|\.env\.local|API Key/);
  });

  it("fund scene explains full report vs quick Q&A", () => {
    const guide = buildUsageGuide();
    const fund = guide.scenes.find((s) => s.scene === "fund");
    expect(fund).toBeDefined();
    const body = JSON.stringify(fund);
    expect(body).toMatch(/完整基金解读报告|AI 解析/);
    expect(body).toMatch(/快速问答|简答/);
  });

  it("compliance section matches short customer copy", () => {
    const guide = buildUsageGuide();
    const compliance = guide.overview.sections.find((s) => s.title === "合规提示");
    expect(compliance?.items[0]?.body).toMatch(/AI 生成内容/);
  });
});
