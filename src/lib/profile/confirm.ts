import type { SupabaseClient } from "@supabase/supabase-js";
import { validateBasicInfo } from "./basic-info";
import { validateGoalConstraint } from "./goal-constraint";
import {
  getProposeArtifact,
  markArtifactConfirmed,
  readArtifactPayload,
} from "./artifacts";
import type {
  GoalConstraintProposePayload,
  ProfileBasicProposePayload,
} from "./types";

export interface ProfileConfirmValidation {
  has_basic_info: boolean;
  has_goal_selected: boolean;
  goal_count: number;
}

export interface ProfileConfirmResult {
  ok: boolean;
  profile_version_id?: string;
  goal_constraint_id?: string;
  goal_constraint_revision_id?: string;
  report_id?: string;
  validation?: ProfileConfirmValidation;
  error?: string;
}

export async function profileConfirmArtifact(
  supabase: SupabaseClient | null,
  artifactId: string,
): Promise<ProfileConfirmResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const artifact = await getProposeArtifact(supabase, artifactId);
  if (!artifact) {
    return { ok: false, error: "确认卡不存在或已失效。" };
  }
  if (artifact.status !== "pending") {
    return { ok: false, error: `该确认卡状态为 ${artifact.status}，无法再次确认。` };
  }

  if (artifact.kind === "profile_basic") {
    return confirmProfileBasicRow(supabase, artifactId, artifact);
  }
  if (artifact.kind === "goal_constraint") {
    return profileConfirmGoalConstraint(supabase, artifactId, artifact);
  }

  return { ok: false, error: `暂不支持确认 kind=${artifact.kind}。` };
}

async function confirmProfileBasicRow(
  supabase: SupabaseClient,
  artifactId: string,
  artifact: { payload_path: string; kind: string },
): Promise<ProfileConfirmResult> {
  const payload = readArtifactPayload(
    artifact.payload_path,
  ) as unknown as ProfileBasicProposePayload;
  const validation = validateBasicInfo(payload.basic_info);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  await supabase
    .from("profile_versions")
    .update({ is_current: false })
    .eq("is_current", true);

  const { data: inserted, error: insertError } = await supabase
    .from("profile_versions")
    .insert({
      is_current: true,
      basic_info: validation.data,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "写入 profile_versions 失败。" };
  }

  const newProfileId = inserted.id as string;

  await supabase
    .from("investment_goal_constraints")
    .update({ profile_version_id: newProfileId })
    .eq("is_active", true);

  await markArtifactConfirmed(supabase, artifactId);

  const profileValidation = await getProfileValidation(supabase);

  return { ok: true, profile_version_id: newProfileId, validation: profileValidation };
}

async function profileConfirmGoalConstraint(
  supabase: SupabaseClient,
  artifactId: string,
  artifact: { payload_path: string; id: string },
): Promise<ProfileConfirmResult> {
  const payload = readArtifactPayload(
    artifact.payload_path,
  ) as unknown as GoalConstraintProposePayload;
  const validation = validateGoalConstraint(payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const data = validation.data;
  const profileVersionId = data.profile_version_id;
  if (!profileVersionId) {
    return { ok: false, error: "缺少 profile_version_id。" };
  }

  const now = new Date().toISOString();
  let goalId = data.goal_constraint_id ?? null;

  if (goalId) {
    const { error: updateError } = await supabase
      .from("investment_goal_constraints")
      .update({
        profile_version_id: profileVersionId,
        goal_detail: data.goal_detail,
        investment_constraints: data.investment_constraints,
        principal_amount: (data.investment_constraints as unknown as Record<string, unknown>).principal_amount,
        monthly_amount: (data.investment_constraints as unknown as Record<string, unknown>).monthly_amount,
        confirmed_at: now,
        display_name: data.goal_display_name ?? null,
      })
      .eq("id", goalId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("investment_goal_constraints")
      .insert({
        profile_version_id: profileVersionId,
        goal_type: data.goal_type,
        display_name: data.goal_display_name ?? null,
        goal_detail: data.goal_detail,
        investment_constraints: data.investment_constraints,
        principal_amount: (data.investment_constraints as unknown as Record<string, unknown>).principal_amount,
        monthly_amount: (data.investment_constraints as unknown as Record<string, unknown>).monthly_amount,
        is_active: true,
        confirmed_at: now,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { ok: false, error: insertError?.message ?? "写入 investment_goal_constraints 失败。" };
    }
    goalId = inserted.id as string;
  }

  const { data: revRows } = await supabase
    .from("goal_constraint_revisions")
    .select("revision_no")
    .eq("goal_constraint_id", goalId)
    .order("revision_no", { ascending: false })
    .limit(1);

  const nextNo = ((revRows?.[0]?.revision_no as number | undefined) ?? 0) + 1;

  const { data: revision, error: revError } = await supabase
    .from("goal_constraint_revisions")
    .insert({
      goal_constraint_id: goalId,
      revision_no: nextNo,
      profile_version_id: profileVersionId,
      goal_detail: data.goal_detail,
      investment_constraints: data.investment_constraints,
      principal_amount: (data.investment_constraints as unknown as Record<string, unknown>).principal_amount,
      monthly_amount: (data.investment_constraints as unknown as Record<string, unknown>).monthly_amount,
      source_artifact_id: artifactId,
      confirmed_at: now,
    })
    .select("id")
    .single();

  if (revError || !revision) {
    return { ok: false, error: revError?.message ?? "写入 goal_constraint_revisions 失败。" };
  }

  await markArtifactConfirmed(supabase, artifactId);

  const profileValidation = await getProfileValidation(supabase);

  return {
    ok: true,
    profile_version_id: profileVersionId,
    goal_constraint_id: goalId,
    goal_constraint_revision_id: revision.id as string,
    validation: profileValidation,
  };
}

async function getProfileValidation(
  supabase: SupabaseClient,
): Promise<ProfileConfirmValidation> {
  const { data: currentProfile } = await supabase
    .from("profile_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const has_basic_info = Boolean(currentProfile?.id);

  const { data: goals } = await supabase
    .from("investment_goal_constraints")
    .select("id")
    .eq("is_active", true)
    .not("confirmed_at", "is", null);

  return {
    has_basic_info,
    has_goal_selected: (goals?.length ?? 0) > 0,
    goal_count: goals?.length ?? 0,
  };
}

/** @deprecated use profileConfirmArtifact */
export async function profileConfirmBasic(
  supabase: SupabaseClient | null,
  artifactId: string,
): Promise<ProfileConfirmResult> {
  return profileConfirmArtifact(supabase, artifactId);
}

export async function syncConversationAfterConfirm(
  supabase: SupabaseClient,
  conversationId: string,
  artifactId: string,
): Promise<void> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const pending = Array.isArray(meta.pending_artifact_ids)
    ? (meta.pending_artifact_ids as string[]).filter((id) => id !== artifactId)
    : [];

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_artifact_ids: pending,
        has_unconfirmed: pending.length > 0,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

export async function markConversationPendingArtifact(
  supabase: SupabaseClient,
  conversationId: string,
  artifactId: string,
): Promise<void> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const pending = new Set<string>(
    Array.isArray(meta.pending_artifact_ids)
      ? (meta.pending_artifact_ids as string[])
      : [],
  );
  pending.add(artifactId);

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_artifact_ids: [...pending],
        has_unconfirmed: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/**
 * @deprecated 投资需求报告已统一走 combine 合体版管线（draftAllGoalsProfileReport），
 * 不再使用逐目标队列机制。保留函数体仅用于向后兼容，不再被调用。
 *
 * PH-PROFILE-RPT-Q-01 (§6.2.8): 将 goal_constraint_id 加入
 * conversations.metadata.pending_profile_report_queue，
 * 触发后续投资需求报告生成。
 */
export async function enqueueProfileReport(
  supabase: SupabaseClient,
  conversationId: string,
  goalConstraintId: string,
): Promise<void> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const queue: string[] = Array.isArray(meta.pending_profile_report_queue)
    ? (meta.pending_profile_report_queue as string[])
    : [];

  // 去重：同一 goal_constraint_id 不重复入队
  if (!queue.includes(goalConstraintId)) {
    queue.push(goalConstraintId);
  }

  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_profile_report_queue: queue,
        has_unconfirmed: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/**
 * @deprecated 投资需求报告已统一走 combine 合体版管线（draftAllGoalsProfileReport），
 * 不再使用逐目标队列消费。保留函数体仅用于向后兼容，不再被调用。
 *
 * PH-PROFILE-RPT-Q-01 消费端：读取队列中待处理的 goal_constraint_id，
 * 为每个触发投资需求报告草稿生成，完成后清理队列。
 */
export async function consumeProfileReportQueue(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ processed: number; errors: string[] }> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const queue: string[] = Array.isArray(meta.pending_profile_report_queue)
    ? (meta.pending_profile_report_queue as string[])
    : [];

  if (queue.length === 0) {
    return { processed: 0, errors: [] };
  }

  const errors: string[] = [];
  let processed = 0;

  for (const gcId of queue) {
    try {
      const { runReportDraft } = await import("@/harness/tools/report_draft");
      const result = await runReportDraft(
        { report_type: "profile", goal_constraint_id: gcId },
        { conversationId, runId: `profile-rpt-${gcId.slice(0, 8)}` },
      );
      if (!result.ok) {
        errors.push(`goal_constraint=${gcId}: ${result.error}`);
      } else {
        processed++;
      }
    } catch (e) {
      errors.push(`goal_constraint=${gcId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 清理已处理的队列
  await supabase
    .from("conversations")
    .update({
      metadata: {
        ...meta,
        pending_profile_report_queue: [],
        has_unconfirmed: errors.length > 0,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  return { processed, errors };
}
