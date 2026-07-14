import { describe, expect, it } from "vitest";
import { detectBackgroundJobType } from "./eligibility";
import {
  forceBackgroundForTests,
  isBackgroundJobsEnabled,
  shouldRunInBackground,
} from "./config";

describe("detectBackgroundJobType", () => {
  it("fund full report → deep_report", () => {
    expect(
      detectBackgroundJobType("fund", "请出具完整解读报告"),
    ).toBe("deep_report");
  });

  it("fund short qa → null", () => {
    expect(detectBackgroundJobType("fund", "019305 净值多少")).toBeNull();
  });

  it("fund regenerate in mode B → deep_report", () => {
    expect(detectBackgroundJobType("fund", "重新生成报告")).toBe("deep_report");
    expect(detectBackgroundJobType("fund", "重新发起解读")).toBe("deep_report");
  });

  it("portfolio re-analyze → deep_analysis", () => {
    expect(
      detectBackgroundJobType("portfolio", "重新分析持仓"),
    ).toBe("deep_analysis");
  });

  it("chat → null", () => {
    expect(detectBackgroundJobType("chat", "重新分析")).toBeNull();
  });
});

describe("shouldRunInBackground", () => {
  it("respects HARNESS_BACKGROUND_JOBS=0", () => {
    const prev = process.env.HARNESS_BACKGROUND_JOBS;
    process.env.HARNESS_BACKGROUND_JOBS = "0";
    expect(shouldRunInBackground("deep_report")).toBe(false);
    process.env.HARNESS_BACKGROUND_JOBS = prev;
  });

  it("force flag enables background", () => {
    const prevBg = process.env.HARNESS_BACKGROUND_JOBS;
    const prevForce = process.env.HARNESS_FORCE_BACKGROUND;
    process.env.HARNESS_BACKGROUND_JOBS = "0";
    process.env.HARNESS_FORCE_BACKGROUND = "1";
    expect(forceBackgroundForTests()).toBe(true);
    expect(shouldRunInBackground("deep_report")).toBe(true);
    process.env.HARNESS_BACKGROUND_JOBS = prevBg;
    process.env.HARNESS_FORCE_BACKGROUND = prevForce;
  });

  it("deep_report enabled by default when jobs on", () => {
    const prev = process.env.HARNESS_BACKGROUND_JOBS;
    delete process.env.HARNESS_BACKGROUND_JOBS;
    delete process.env.HARNESS_FORCE_BACKGROUND;
    expect(isBackgroundJobsEnabled()).toBe(true);
    expect(shouldRunInBackground("deep_report")).toBe(true);
    process.env.HARNESS_BACKGROUND_JOBS = prev;
  });
});
