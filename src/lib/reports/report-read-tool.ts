import fs from "node:fs";
import { getReportById } from "@/lib/reports/read";
import type { ReportDeepLinkTab } from "@/lib/reports/parse-report-link";
import { getSupabase } from "@/lib/supabase/server";

const MAX_EXCERPT_CHARS = 12_000;

export interface ReportReadResult {
  ok: boolean;
  report_id?: string;
  report_type?: string;
  title?: string;
  generated_at?: string;
  excerpt?: string;
  truncated?: boolean;
  error?: string;
}

export async function readPublishedReport(input: {
  report_id: string;
  tab?: ReportDeepLinkTab;
}): Promise<ReportReadResult> {
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const loaded = await getReportById(supabase, input.report_id);
  if (!loaded.ok || !loaded.report) {
    return { ok: false, error: loaded.error ?? "找不到该报告链接。" };
  }

  const report = loaded.report;
  if (input.tab && report.report_type !== input.tab) {
    return {
      ok: false,
      error: `报告类型与链接 tab=${input.tab} 不匹配（实际为 ${report.report_type}）。`,
    };
  }

  const markdown = report.markdown ?? "";
  if (!markdown && report.file_path && fs.existsSync(report.file_path)) {
    const body = fs.readFileSync(report.file_path, "utf8");
    return formatExcerpt({
      report_id: report.id,
      report_type: report.report_type,
      title: report.report_name,
      generated_at: report.generated_at,
      body,
    });
  }

  return formatExcerpt({
    report_id: report.id,
    report_type: report.report_type,
    title: report.report_name,
    generated_at: report.generated_at,
    body: markdown,
  });
}

function formatExcerpt(input: {
  report_id: string;
  report_type: string;
  title: string;
  generated_at: string;
  body: string;
}): ReportReadResult {
  const truncated = input.body.length > MAX_EXCERPT_CHARS;
  const excerpt = truncated
    ? `${input.body.slice(0, MAX_EXCERPT_CHARS)}…`
    : input.body;

  return {
    ok: true,
    report_id: input.report_id,
    report_type: input.report_type,
    title: input.title,
    generated_at: input.generated_at,
    excerpt,
    truncated,
  };
}
