import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import { validateDraftFileForPublish } from "@/lib/reports/publish-guard";
import { goalDisplayName } from "@/lib/profile/goal-labels";

export interface PublishPlanReportResult {
  ok: boolean;
  report_id?: string;
  file_path?: string;
  error?: string;
}

export async function publishPlanReport(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    goalConstraintId: string;
    draftPath?: string;
  },
): Promise<PublishPlanReportResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const { data: plan } = await supabase
    .from("allocation_plans")
    .select("id, profile_version_id, confirmed_at")
    .eq("goal_constraint_id", params.goalConstraintId)
    .eq("plan_step", 2)
    .eq("is_current", true)
    .maybeSingle();

  if (!plan?.confirmed_at) {
    return { ok: false, error: "请先确认基金明细方案（plan_step=2）后再发布规划书。" };
  }

  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name")
    .eq("id", params.goalConstraintId)
    .maybeSingle();

  if (!goal) {
    return { ok: false, error: "未找到该投资需求组。" };
  }

  const { data: profileReports } = await supabase
    .from("report_index")
    .select("id")
    .eq("report_type", "profile")
    .eq("goal_constraint_id", params.goalConstraintId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const profileReportId = profileReports?.[0]?.id as string | undefined;

  let sourcePath = params.draftPath;
  if (!sourcePath) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", params.conversationId)
      .maybeSingle();
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    const draft = meta.pending_report_draft as
      | { file_path?: string; goal_constraint_id?: string; report_type?: string }
      | undefined;
    if (
      draft?.goal_constraint_id === params.goalConstraintId &&
      draft.report_type === "plan"
    ) {
      sourcePath = draft.file_path;
    }
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { ok: false, error: "找不到规划书草稿，请先说「生成规划书」。" };
  }

  const mermaidCheck = validateDraftFileForPublish(sourcePath);
  if (!mermaidCheck.ok) {
    return { ok: false, error: mermaidCheck.error };
  }

  const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
  const publishedDir = path.join(getDataDir(), "reports", "plan", "published");
  fs.mkdirSync(publishedDir, { recursive: true });
  const fileName = `${params.goalConstraintId.slice(0, 8)}-${Date.now()}.md`;
  const destPath = path.join(publishedDir, fileName);
  fs.copyFileSync(sourcePath, destPath);

  const reportName = `${sceneName}-资产配置方案-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  const metadata: Record<string, unknown> = {};
  if (profileReportId) {
    metadata.profile_report_id = profileReportId;
  }

  const { data: report, error: reportError } = await supabase
    .from("report_index")
    .insert({
      report_type: "plan",
      report_name: reportName,
      file_path: destPath,
      profile_version_id: plan.profile_version_id,
      goal_constraint_id: params.goalConstraintId,
      allocation_plan_id: plan.id,
      metadata: Object.keys(metadata).length ? metadata : null,
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
    | { goal_constraint_id?: string; report_type?: string }
    | undefined;

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_report_draft:
          pendingDraft?.goal_constraint_id === params.goalConstraintId &&
          pendingDraft?.report_type === "plan"
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
