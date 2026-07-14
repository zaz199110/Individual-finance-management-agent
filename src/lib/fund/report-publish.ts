import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import { validateDraftFileForPublish } from "@/lib/reports/publish-guard";
import { fundLookup } from "./lookup";

export interface PublishFundReportResult {
  ok: boolean;
  report_id?: string;
  file_path?: string;
  error?: string;
}

export async function publishFundReport(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    fundCode: string;
    draftPath?: string;
  },
): Promise<PublishFundReportResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const lookup = fundLookup({ fund_code: params.fundCode });
  if (!lookup.ok) {
    return { ok: false, error: lookup.error };
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", params.conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const pendingDraft = meta.pending_report_draft as
    | {
        file_path?: string;
        fund_code?: string;
        report_type?: string;
        knowledge_citations?: Array<Record<string, unknown>>;
      }
    | undefined;

  let sourcePath = params.draftPath;
  if (!sourcePath) {
    if (pendingDraft?.fund_code === params.fundCode && pendingDraft.report_type === "fund") {
      sourcePath = pendingDraft.file_path;
    }
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { ok: false, error: "找不到报告草稿，请先生成基金解读报告。" };
  }

  const mermaidCheck = validateDraftFileForPublish(sourcePath);
  if (!mermaidCheck.ok) {
    return { ok: false, error: mermaidCheck.error };
  }

  const publishedDir = path.join(getDataDir(), "reports", "fund", "published");
  fs.mkdirSync(publishedDir, { recursive: true });
  const slug = `${params.fundCode}-${Date.now()}`;
  const destPath = path.join(publishedDir, `${slug}.md`);
  fs.copyFileSync(sourcePath, destPath);

  const reportName = `${params.fundCode}-${lookup.fund_name ?? "基金解读"}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  const knowledgeCitations =
    pendingDraft?.fund_code === params.fundCode &&
    pendingDraft?.report_type === "fund"
      ? pendingDraft.knowledge_citations
      : undefined;

  const { data: report, error: reportError } = await supabase
    .from("report_index")
    .insert({
      report_type: "fund",
      report_name: reportName,
      report_slug: slug,
      file_path: destPath,
      fund_code: params.fundCode,
      generated_at: new Date().toISOString(),
      metadata: knowledgeCitations?.length
        ? { knowledge_citations: knowledgeCitations }
        : {},
    })
    .select("id")
    .single();

  if (reportError || !report) {
    return { ok: false, error: reportError?.message ?? "写入 report_index 失败。" };
  }

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_report_draft:
          pendingDraft?.fund_code === params.fundCode &&
          pendingDraft?.report_type === "fund"
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
