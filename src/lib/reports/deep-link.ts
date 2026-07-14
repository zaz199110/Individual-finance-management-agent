import type { ReportTab } from "./types";

/** Build full report deep link URL (RPT-LINK-01). */
export function buildReportDeepLink(params: {
  tab: ReportTab;
  reportId: string;
  conversationId?: string | null;
  origin?: string;
}): string {
  const q = new URLSearchParams();
  q.set("tab", params.tab);
  q.set("id", params.reportId);
  if (params.conversationId) q.set("c", params.conversationId);
  const path = `/reports?${q.toString()}`;
  const origin = params.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return origin ? `${origin}${path}` : path;
}
