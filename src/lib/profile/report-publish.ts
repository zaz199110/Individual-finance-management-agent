import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import { readDraftMeta } from "@/lib/reports/draft-meta";
import { validateDraftFileForPublish } from "@/lib/reports/publish-guard";
import { goalDisplayName } from "./goal-labels";

export interface PublishProfileReportResult {
  ok: boolean;
  report_id?: string;
  file_path?: string;
  error?: string;
}

export async function publishProfileReport(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    goalConstraintId: string;
    draftPath?: string;
  },
): Promise<PublishProfileReportResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name, profile_version_id, confirmed_at")
    .eq("id", params.goalConstraintId)
    .maybeSingle();

  if (!goal?.confirmed_at) {
    return { ok: false, error: "该投资需求组尚未确认写库。" };
  }

  const { data: revisions } = await supabase
    .from("goal_constraint_revisions")
    .select("id")
    .eq("goal_constraint_id", params.goalConstraintId)
    .order("revision_no", { ascending: false })
    .limit(1);

  const revisionId = revisions?.[0]?.id as string | undefined;
  if (!revisionId) {
    return { ok: false, error: "未找到约束修订快照。" };
  }

  let sourcePath = params.draftPath;
  if (!sourcePath) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", params.conversationId)
      .maybeSingle();
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    const draft = meta.pending_report_draft as
      | { file_path?: string; goal_constraint_id?: string }
      | undefined;
    if (draft?.goal_constraint_id === params.goalConstraintId) {
      sourcePath = draft.file_path;
    }
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { ok: false, error: "找不到报告草稿文件，请先生成 report_draft。" };
  }

  const mermaidCheck = validateDraftFileForPublish(sourcePath);
  if (!mermaidCheck.ok) {
    return { ok: false, error: mermaidCheck.error };
  }

  const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
  const draftMeta = readDraftMeta(sourcePath);
  const metaReportName =
    typeof draftMeta?.report_name === "string" ? draftMeta.report_name.trim() : "";
  const publishedDir = path.join(getDataDir(), "reports", "profile", "published");
  fs.mkdirSync(publishedDir, { recursive: true });
  const fileName = `${params.goalConstraintId.slice(0, 8)}-${Date.now()}.md`;
  const destPath = path.join(publishedDir, fileName);
  fs.copyFileSync(sourcePath, destPath);

  const reportName =
    metaReportName ||
    `${sceneName}-投资需求-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  const { data: report, error: reportError } = await supabase
    .from("report_index")
    .insert({
      report_type: "profile",
      report_name: reportName,
      file_path: destPath,
      profile_version_id: goal.profile_version_id,
      goal_constraint_id: params.goalConstraintId,
      goal_constraint_revision_id: revisionId,
      generated_at: new Date().toISOString(),
    })
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
    | { goal_constraint_id?: string }
    | undefined;

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_report_draft:
          pendingDraft?.goal_constraint_id === params.goalConstraintId
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
