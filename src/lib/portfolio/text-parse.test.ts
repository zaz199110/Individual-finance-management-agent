import { describe, expect, it } from "vitest";
import { textParseHoldings } from "@/lib/portfolio/text-parse";

/**
 * Unit tests for textParseHoldings — focusing on pipe-separated format parsing,
 * including the single-line fallback (collapsed newlines) scenario.
 *
 * Note: LLM fallback path is NOT tested here (would require mocking completeText).
 * These tests verify the regex-based parsing paths only.
 */
describe("textParseHoldings — pipe-separated format", () => {
  const HEADER = "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额";

  it("parses normal multi-line pipe-separated table", async () => {
    const input = [
      HEADER,
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35",
      "广发钱袋子货币A | 000509 | 2025-08-12 | 20,000 | 20,000",
    ].join("\n");

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0].fund_code).toBe("003547");
    expect(result.positions[1].fund_code).toBe("000509");
  });

  it("parses double-newline separated table (buildPortGuide output)", async () => {
    const input = [
      HEADER,
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35",
      "广发钱袋子货币A | 000509 | 2025-08-12 | 20,000 | 20,000",
    ].join("\n\n");

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0].fund_code).toBe("003547");
  });

  it("parses single-line input (collapsed newlines — the copy-paste bug)", async () => {
    // Simulates what happens when markdown rendering collapses \n to spaces:
    // "header row1 row2 row3"
    const input =
      "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额 " +
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35 " +
      "广发钱袋子货币A | 000509 | 2025-08-12 | 20,000 | 20,000";

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0].fund_code).toBe("003547");
    expect(result.positions[1].fund_code).toBe("000509");
  });

  it("parses single-line with trailing free text", async () => {
    const input =
      "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额 " +
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35 " +
      "这是我的新的持仓";

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].fund_code).toBe("003547");
  });

  it("handles full-width pipe characters", async () => {
    const fwp = "\uFF5C"; // ｜
    const input =
      `基金名称${fwp}基金代码${fwp}买入时间${fwp}买入金额${fwp}持有份额\n` +
      `鹏华丰享债券${fwp}003547${fwp}2025-08-12${fwp}30,000${fwp}28,412.35`;

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].fund_code).toBe("003547");
  });

  it("handles <br> tags as line separators", async () => {
    const input =
      "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额<br>" +
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35<br>" +
      "广发钱袋子货币A | 000509 | 2025-08-12 | 20,000 | 20,000";

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0].fund_code).toBe("003547");
  });

  it("handles <br/> self-closing tags", async () => {
    const input =
      "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额<br/>" +
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35";

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
  });

  it("handles zero-width characters in pipe-separated table", async () => {
    const zwsp = "\u200B";
    const bom = "\uFEFF";
    const input =
      `${bom}基金名称 | ${zwsp}基金代码 | 买入时间 | 买入金额 | 持有份额\n` +
      `鹏华丰享债券 | 003547${zwsp} | 2025-08-12 | 30,000 | 28,412.35`;

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].fund_code).toBe("003547");
  });

  it("handles non-breaking spaces", async () => {
    const nbsp = "\u00A0";
    const input =
      `基金名称${nbsp}|${nbsp}基金代码${nbsp}|${nbsp}买入时间${nbsp}|${nbsp}买入金额${nbsp}|${nbsp}持有份额\n` +
      `鹏华丰享债券${nbsp}|${nbsp}003547${nbsp}|${nbsp}2025-08-12${nbsp}|${nbsp}30,000${nbsp}|${nbsp}28,412.35`;

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
  });

  it("skips separator lines (---|---)", async () => {
    const input = [
      HEADER,
      "---|---|---|---|---",
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35",
    ].join("\n");

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(1);
  });

  it("returns null for text without pipe separators or fund codes", async () => {
    const result = await textParseHoldings({ user_text: "今天天气不错" });
    // Without LLM fallback, this should fail gracefully
    // (LLM path would be called but may return empty)
    expect(result.ok).toBe(false);
  });

  it("handles 5+ rows in single-line format", async () => {
    const input =
      "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额 " +
      "鹏华丰享债券 | 003547 | 2025-08-12 | 30,000 | 28,412.35 " +
      "广发钱袋子货币A | 000509 | 2025-08-12 | 20,000 | 20,000 " +
      "招商中证白酒指数(LOF)A | 161725 | 2026-01-08 | 38,500 | 32,105.88 " +
      "易方达增强回报债券A | 110017 | 2026-02-20 | 50,000 | 38,264.22 " +
      "易方达增强回报债券A | 110017 | 2025-02-20 | 50,000 | 38,264.22";

    const result = await textParseHoldings({ user_text: input });
    expect(result.ok).toBe(true);
    expect(result.positions).toHaveLength(5);
    expect(result.positions.map((p) => p.fund_code)).toEqual([
      "003547", "000509", "161725", "110017", "110017",
    ]);
  });
});
