import { readPublishedReport } from "@/lib/reports/report-read-tool";
import type { ReportDeepLinkTab } from "@/lib/reports/parse-report-link";

export async function runReportRead(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const reportId = String(input.report_id ?? input.id ?? "").trim();
  if (!reportId) {
    return { ok: false, preview: "", error: "缺少 report_id。" };
  }

  const tabRaw = input.tab ? String(input.tab) : undefined;
  const tab = tabRaw as ReportDeepLinkTab | undefined;

  const result = await readPublishedReport({
    report_id: reportId,
    tab,
  });

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  const preview = [
    `《${result.title}》(${result.report_type})`,
    result.generated_at ? `生成于 ${result.generated_at}` : "",
    result.truncated ? "（正文已截断）" : "",
    "",
    (result.excerpt ?? "").slice(0, 2000),
  ]
    .filter(Boolean)
    .join("\n");

  return { ok: true, preview, data: result };
}
