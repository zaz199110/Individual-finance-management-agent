import { describe, expect, it } from "vitest";
import {
  buildConversationTitle,
  commitRenameTitle,
  formatConversationDate,
  getRenameDraft,
  isAutoTitleCandidate,
  isStructuredConversationTitle,
  parseConversationTitle,
  summarizeFirstQuestion,
} from "./conversation-title";

describe("conversation-title", () => {
  it("builds structured title", () => {
    expect(buildConversationTitle("chat", "养老规划咨询", "20250620")).toBe(
      "【自由问答】-养老规划咨询-20250620",
    );
    expect(buildConversationTitle("fund", "易方达蓝筹", "20250620")).toBe(
      "【基金解析】-易方达蓝筹-20250620",
    );
  });

  it("parses structured title", () => {
    const parsed = parseConversationTitle("【持仓分析】-最大回撤怎么算-20250620");
    expect(parsed).toEqual({
      sceneLabel: "持仓分析",
      summary: "最大回撤怎么算",
      date: "20250620",
    });
  });

  it("summarizes first question", () => {
    expect(summarizeFirstQuestion("  什么是最大回撤？  ")).toBe("什么是最大回撤？");
    expect(summarizeFirstQuestion("a".repeat(25)).length).toBeLessThanOrEqual(21);
    expect(summarizeFirstQuestion("   ")).toBe("未命名对话");
  });

  it("detects auto title candidates", () => {
    expect(isAutoTitleCandidate("新对话")).toBe(true);
    expect(isAutoTitleCandidate("需求梳理 · 新对话")).toBe(true);
    expect(isAutoTitleCandidate("【自由问答】-养老-20250620")).toBe(false);
    expect(isAutoTitleCandidate("定时持仓分析 · 20250620")).toBe(false);
  });

  it("rename draft only exposes summary for structured titles", () => {
    const title = "【资产配置】-稳健型方案-20250620";
    expect(getRenameDraft(title)).toEqual({
      structured: true,
      draft: "稳健型方案",
      parsed: {
        sceneLabel: "资产配置",
        summary: "稳健型方案",
        date: "20250620",
      },
    });
  });

  it("commit rename rebuilds structured title", () => {
    const current = "【自由问答】-旧摘要-20250620";
    expect(commitRenameTitle(current, "新摘要")).toBe(
      "【自由问答】-新摘要-20250620",
    );
  });

  it("formatConversationDate uses local calendar day", () => {
    const iso = "2025-06-20T10:00:00.000Z";
    expect(formatConversationDate(iso)).toMatch(/^\d{8}$/);
  });

  it("isStructuredConversationTitle", () => {
    expect(isStructuredConversationTitle("【自由问答】-test-20250620")).toBe(true);
    expect(isStructuredConversationTitle("新对话")).toBe(false);
  });
});
