import type { SceneId } from "@/harness/registry/load";
import { isFundFullReportIntent } from "@/lib/fund/report-intent";
import type { BackgroundJobType } from "./types";

function isPortfolioReportIntent(text: string): boolean {
  return /重新分析|持仓分析|生成.*报告|持仓报告/.test(text);
}

function isPlanReportIntent(text: string): boolean {
  return /规划书|投资规划|生成.*方案报告|出具规划/.test(text);
}

function isProfileReportIntent(text: string): boolean {
  return /需求报告|梳理报告|生成.*需求.*报告|出具需求/.test(text);
}

/**
 * 判断是否应创建 background_job（deep_report / deep_analysis）。
 * scheduled 由定时模块单独写入。
 */
export function detectBackgroundJobType(
  scene: SceneId,
  userMessage: string,
): BackgroundJobType | null {
  const text = userMessage.trim();
  if (!text) return null;

  if (scene === "fund" && isFundFullReportIntent(text)) {
    return "deep_report";
  }
  if (scene === "portfolio" && isPortfolioReportIntent(text)) {
    return "deep_analysis";
  }
  if (scene === "plan" && isPlanReportIntent(text)) {
    return "deep_report";
  }
  if (scene === "profile" && isProfileReportIntent(text)) {
    return "deep_report";
  }

  return null;
}
