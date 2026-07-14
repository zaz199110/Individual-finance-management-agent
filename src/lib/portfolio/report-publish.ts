import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import { readDraftMeta } from "@/lib/reports/draft-meta";
import { validateDraftFileForPublish } from "@/lib/reports/publish-guard";
import { buildPortfolioReportName } from "./portfolio-report-name";

export interface PublishPortfolioReportResult {
  ok: boolean;
  report_id?: string;
  file_path?: string;
  error?: string;
}

export async function publishPortfolioReport(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    holdingsVersionId: string;
    draftPath?: string;
    triggerSource?: "manual" | "scheduled";
    asOfTradeDate?: string;
  },
): Promise<PublishPortfolioReportResult> {
  // Resolve source path
  let sourcePath = params.draftPath;
  if (!sourcePath) {
    if (!supabase) {
      return { ok: false, error: "找不到报告草稿，请先说「重新分析」或「生成持仓报告」。" };
    }
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", params.conversationId)
      .maybeSingle();
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    const draft = meta.pending_report_draft as
      | { file_path?: string; holdings_version_id?: string; report_type?: string }
      | undefined;
    if (
      draft?.holdings_version_id === params.holdingsVersionId &&
      draft.report_type === "portfolio"
    ) {
      sourcePath = draft.file_path;
    }
  }

  // Validate draft file exists
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { ok: false, error: "找不到报告草稿，请先说「重新分析」或「生成持仓报告」。" };
  }

  // Validate draft file content
  const mermaidCheck = validateDraftFileForPublish(sourcePath);
  if (!mermaidCheck.ok) {
    return { ok: false, error: mermaidCheck.error };
  }

  // Save file locally (shared code path — runs regardless of Supabase)
  const publishedDir = path.join(getDataDir(), "reports", "portfolio", "published");
  fs.mkdirSync(publishedDir, { recursive: true });
  const fileName = `${params.holdingsVersionId.slice(0, 8)}-${Date.now()}.md`;
  const destPath = path.join(publishedDir, fileName);
  fs.copyFileSync(sourcePath, destPath);

  const draftMeta = readDraftMeta(sourcePath);
  const reportName =
    typeof draftMeta?.report_name === "string" && draftMeta.report_name.trim()
      ? draftMeta.report_name.trim()
      : buildPortfolioReportName({});

  // If no Supabase, return local-only result
  if (!supabase) {
    return { ok: true, report_id: fileName.replace(".md", ""), file_path: destPath };
  }

  // --- Supabase path (unchanged logic, using destPath and reportName from above) ---

  const { data: holdings } = await supabase
    .from("holdings_versions")
    .select("id, confirmed_at")
    .eq("id", params.holdingsVersionId)
    .maybeSingle();

  if (!holdings?.confirmed_at) {
    return { ok: false, error: "该持仓版本尚未确认写库。" };
  }

  const metadata: Record<string, unknown> = {
    trigger_source: params.triggerSource ?? "manual",
  };
  if (params.asOfTradeDate) {
    metadata.as_of_trade_date = params.asOfTradeDate;
  }
  const reportSlug = fileName.replace(/\.md$/, "");
  const insertRow: Record<string, unknown> = {
    report_slug: reportSlug,
    report_type: "portfolio",
    report_name: reportName,
    file_path: destPath,
    holdings_version_id: params.holdingsVersionId,
    generated_at: new Date().toISOString(),
    metadata,
  };
  const { data: report, error: reportError } = await supabase
    .from("report_index")
    .insert(insertRow)
    .select("id")
    .single();

  if (reportError || !report) {
    return { ok: false, error: reportError?.message ?? "写入 report_index 失败。" };
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", params.conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const pendingDraft = meta.pending_report_draft as
    | { holdings_version_id?: string; report_type?: string }
    | undefined;

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_report_draft:
          pendingDraft?.holdings_version_id === params.holdingsVersionId &&
          pendingDraft?.report_type === "portfolio"
            ? null
            : meta.pending_report_draft,
        has_unconfirmed: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId);

  return {
    ok: true,
    report_id: report.id as string,
    file_path: destPath,
  };
}
