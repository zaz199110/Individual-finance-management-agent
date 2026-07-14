import { describe, expect, it } from "vitest";
import {
  handoffCardBodyText,
  handoffCrossSceneAskText,
  handoffGoButtonLabel,
  handoffPortfolioScreenshotSuffix,
} from "./copy";

describe("handoff copy", () => {
  it("uses consistent go button label", () => {
    expect(handoffGoButtonLabel("需求梳理")).toBe("去「需求梳理」");
  });

  it("card body references button below, not 上方", () => {
    const body = handoffCardBodyText("资产配置");
    expect(body).toContain("点击下方");
    expect(body).toContain("去「资产配置」");
    expect(body).not.toContain("上方");
  });

  it("cross_scene ask covers all business tabs", () => {
    for (const scene of ["profile", "plan", "portfolio", "fund"] as const) {
      const text = handoffCrossSceneAskText(scene);
      expect(text).toContain("点击下方卡片");
      expect(text).not.toContain("上方");
    }
  });

  it("portfolio screenshot suffix matches card pattern", () => {
    const suffix = handoffPortfolioScreenshotSuffix();
    expect(suffix).toContain("点击下方卡片");
    expect(suffix).toContain("去「持仓分析」");
    expect(suffix).not.toContain("上方");
  });
});
