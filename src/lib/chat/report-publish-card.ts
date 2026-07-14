import type { ReportPublishCardBlock } from "@/components/chat/types";

export interface ReportPreviewTarget {
  run_id?: string;
  file_path?: string;
  report_name?: string;
}

/** RPT-CARD-01：同场景多版草稿的去重键 */
export function reportCardKey(card: ReportPublishCardBlock): string {
  if (card.report_type === "portfolio") {
    return `portfolio:${card.holdings_version_id ?? card.report_name}`;
  }
  if (card.report_type === "fund") {
    return `fund:${card.fund_code ?? card.report_name}`;
  }
  return `goal:${card.goal_constraint_id ?? card.report_name}`;
}

/** 从 run 工作区路径解析 run_id */
export function extractRunIdFromDraftPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/runs\/[^/]+\/([^/]+)\/draft-report\.md$/);
  return match?.[1];
}

export function previewTargetFromCard(
  card: ReportPublishCardBlock,
): ReportPreviewTarget {
  const run_id = card.file_path
    ? extractRunIdFromDraftPath(card.file_path)
    : undefined;
  return {
    run_id,
    file_path: card.file_path,
    report_name: card.report_name,
  };
}

export function previewTargetFromPending(input: {
  run_id?: string;
  file_path?: string;
  report_name?: string;
} | null | undefined): ReportPreviewTarget | null {
  if (!input?.run_id && !input?.file_path) return null;
  return {
    run_id: input.run_id,
    file_path: input.file_path,
    report_name: input.report_name,
  };
}

export function previewTargetKey(target: ReportPreviewTarget | null | undefined): string {
  if (!target) return "";
  return target.file_path ?? target.run_id ?? "";
}

/** metadata 最新草稿与卡片是否同一版本 */
export function isLatestReportPublishCard(
  card: ReportPublishCardBlock,
  latestFilePath: string | undefined,
): boolean {
  if (card.status !== "active") return false;
  if (!latestFilePath) return true;
  if (card.file_path) return card.file_path === latestFilePath;
  return false;
}

export function buildDraftPreviewUrl(
  conversationId: string,
  target: ReportPreviewTarget,
): string {
  const params = new URLSearchParams();
  if (target.run_id) params.set("run_id", target.run_id);
  if (target.file_path) params.set("file_path", target.file_path);
  const qs = params.toString();
  return `/api/conversations/${conversationId}/draft${qs ? `?${qs}` : ""}`;
}
