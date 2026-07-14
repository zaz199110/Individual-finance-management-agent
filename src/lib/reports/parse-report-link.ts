export type ReportDeepLinkTab = "profile" | "plan" | "portfolio" | "fund";

export interface ParsedReportDeepLink {
  tab: ReportDeepLinkTab;
  report_id: string;
}

const TAB_SET = new Set<string>(["profile", "plan", "portfolio", "fund"]);
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** 从聊天消息中解析「我的报告」深链（RPT-LINK-01） */
export function parseReportDeepLink(text: string): ParsedReportDeepLink | null {
  const hay = text.trim();
  if (!hay.includes("/reports") && !hay.includes("tab=")) return null;

  const tabMatch = hay.match(/tab=(profile|plan|portfolio|fund)/i);
  const tab = tabMatch?.[1]?.toLowerCase();
  if (!tab || !TAB_SET.has(tab)) return null;

  const idMatch = hay.match(/id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  let reportId = idMatch?.[1] ?? null;
  if (!reportId) {
    reportId = hay.match(UUID_RE)?.[0] ?? null;
  }
  if (!reportId) return null;

  return {
    tab: tab as ReportDeepLinkTab,
    report_id: reportId,
  };
}
