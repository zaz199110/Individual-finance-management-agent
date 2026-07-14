import { describe, expect, it } from "vitest";
import {
  containsInternalTerms,
  sanitizeCustomerFacingText,
} from "./customer-copy";

describe("sanitizeCustomerFacingText", () => {
  it("removes agent instructions from L2 FAQ excerpts", () => {
    const raw =
      "常见口径：管理费约 0.50%/年，托管费约 0.15%/年。具体以最新招募说明书为准，写报告须用 fund_knowledge_explore 检索披露原文并做 FK-CITE。";
    const cleaned = sanitizeCustomerFacingText(raw);
    expect(cleaned).not.toMatch(/fund_knowledge_explore|FK-CITE|explore/i);
    expect(cleaned).toContain("0.50%");
    expect(containsInternalTerms(cleaned)).toBe(false);
  });

  it("rewrites L0/L3 in no-vault cite section", () => {
    const raw =
      "硬事实来自 **授权行情（L0）** 与 **公开联网页面（L3）**，请以基金公司最新法律文件为准。";
    const cleaned = sanitizeCustomerFacingText(raw);
    expect(cleaned).not.toMatch(/\bL0\b|\bL3\b/);
    expect(containsInternalTerms(cleaned)).toBe(false);
  });

  it("strips L0/L1/L3 from multi-entry L2 preview blocks", () => {
    const raw = [
      "Agent 须查 L0 公告状态 + L1 披露，不可凭记忆断言「能买/不能买」。",
      "联网新闻仅作 L3 补充。",
    ].join("\n\n");
    const cleaned = sanitizeCustomerFacingText(raw);
    expect(containsInternalTerms(cleaned)).toBe(false);
  });
});

describe("formatFkCiteSection no-vault copy", () => {
  it("uses customer-facing source labels", async () => {
    const { formatFkCiteSection } = await import("./knowledge-citations");
    const section = formatFkCiteSection([], false, []);
    expect(section).toContain("授权行情数据");
    expect(section).toContain("公开联网检索");
    expect(section).not.toMatch(/\bL0\b|\bL3\b/);
    expect(containsInternalTerms(section)).toBe(false);
  });

  it("lists web citations with document and link columns once", async () => {
    const { formatFkCiteSection } = await import("./knowledge-citations");
    const section = formatFkCiteSection([], false, [
      {
        title: "鹏华消费优选混合(206007)基金基本概况",
        url: "http://fund.eastmoney.com/f10/206007.html",
      },
    ]);
    expect(section).toContain("| 标题 | 说明 |");
    expect(section).toContain("鹏华消费优选混合(206007)基金基本概况");
    expect(section).toContain("http://fund.eastmoney.com/f10/206007.html");
    expect(section).not.toContain("[打开]");
    expect(section).toContain("不代表推荐");
    expect(section.match(/不代表推荐/g)?.length).toBe(2);
    expect(section).not.toContain("公开联网检索摘要");
  });
});
