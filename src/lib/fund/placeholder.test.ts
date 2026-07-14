import { describe, expect, it } from "vitest";
import {
  buildFundWatchlistAnalyzePrompt,
  buildFundWatchlistInputHint,
} from "./placeholder";

describe("buildFundWatchlistAnalyzePrompt (WL-03)", () => {
  it("injects fund code for full report intent", () => {
    expect(buildFundWatchlistAnalyzePrompt("206007")).toBe(
      "请就 206007 出具完整基金解读报告",
    );
  });
});

describe("buildFundWatchlistInputHint", () => {
  it("mentions AI 解析 action", () => {
    expect(buildFundWatchlistInputHint()).toMatch(/AI 解析/);
  });
});
