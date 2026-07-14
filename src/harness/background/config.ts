import type { BackgroundJobType } from "./types";

/** HARNESS §8d — 超过此阈值可转后台（与 deep_* 类型并列） */
export const BACKGROUND_THRESHOLD_MS = 30_000;

export function isBackgroundJobsEnabled(): boolean {
  return process.env.HARNESS_BACKGROUND_JOBS !== "0";
}

/** 验收 / 联调：强制走后台路径 */
export function forceBackgroundForTests(): boolean {
  return process.env.HARNESS_FORCE_BACKGROUND === "1";
}

export function shouldRunInBackground(
  jobType: BackgroundJobType | null,
): boolean {
  if (!jobType) return false;
  if (forceBackgroundForTests()) return true;
  if (!isBackgroundJobsEnabled()) return false;
  return jobType === "deep_report" || jobType === "deep_analysis";
}
