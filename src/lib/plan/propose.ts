import type { SupabaseClient } from "@supabase/supabase-js";
import { createProposeArtifact } from "@/lib/profile/artifacts";
import type { ConfirmCardBlock } from "@/lib/profile/types";
import { resolveGoalForPlan } from "./read";
import { loadSamplePlanAllocation, loadSamplePlanDetail } from "./samples";
import type { PlanAllocationPayload, PlanDetailPayload } from "./types";
import {
  formatPlanAllocationCardBody,
  formatPlanDetailCardBody,
  validatePlanAllocation,
  validatePlanDetail,
} from "./validate";

export interface PlanProposeResult {
  ok: boolean;
  artifact_id?: string;
  summary_zh?: string;
  card?: ConfirmCardBlock;
  preview?: string;
  error?: string;
}

export async function planProposeAllocation(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    payload: PlanAllocationPayload;
  },
): Promise<PlanProposeResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接，无法创建确认卡。" };
  }

  const validation = validatePlanAllocation(params.payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const resolved = await resolveGoalForPlan(
    supabase,
    validation.data.goal_constraint_id,
  );
  if (!resolved.ok || !resolved.goalId || !resolved.profileVersionId) {
    return { ok: false, error: resolved.error };
  }

  const data: PlanAllocationPayload = {
    ...validation.data,
    goal_constraint_id: resolved.goalId,
    profile_version_id: resolved.profileVersionId,
    card_title: validation.data.card_title ?? "请确认：大类资产配置",
  };

  const cats = data.target_allocation.categories
    .map((c) => `${c.category} ${c.allocation_pct}%`)
    .join(" · ");
  const summary = `${data.goal_display_name ?? "目标场景"} · ${cats}`;

  const artifact = await createProposeArtifact(supabase, {
    conversationId: params.conversationId,
    runId: params.runId,
    kind: "plan_allocation",
    summaryZh: summary,
    payload: data as unknown as Record<string, unknown>,
  });

  const card: ConfirmCardBlock = {
    type: "confirm_card",
    status: "active",
    artifact_id: artifact.id,
    card_kind: "plan_allocation",
    summary_zh: summary,
    card_title: data.card_title,
  };

  return {
    ok: true,
    artifact_id: artifact.id,
    summary_zh: summary,
    card,
    preview: formatPlanAllocationCardBody(data),
  };
}

export async function planProposeDetail(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    payload: PlanDetailPayload;
  },
): Promise<PlanProposeResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接，无法创建确认卡。" };
  }

  const validation = validatePlanDetail(params.payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const resolved = await resolveGoalForPlan(
    supabase,
    validation.data.goal_constraint_id,
  );
  if (!resolved.ok || !resolved.goalId || !resolved.profileVersionId) {
    return { ok: false, error: resolved.error };
  }

  const { data: step1 } = await supabase
    .from("allocation_plans")
    .select("id")
    .eq("goal_constraint_id", resolved.goalId)
    .eq("plan_step", 1)
    .limit(1);
  if (!step1?.length) {
    return { ok: false, error: "请先确认大类资产配置（第一步）。" };
  }

  const data: PlanDetailPayload = {
    ...validation.data,
    goal_constraint_id: resolved.goalId,
    profile_version_id: resolved.profileVersionId,
    card_title: validation.data.card_title ?? "请确认：基金明细与执行安排",
  };

  const summary = `${data.goal_display_name ?? "目标场景"} · 基金明细方案`;

  const artifact = await createProposeArtifact(supabase, {
    conversationId: params.conversationId,
    runId: params.runId,
    kind: "plan_detail",
    summaryZh: summary,
    payload: data as unknown as Record<string, unknown>,
  });

  const card: ConfirmCardBlock = {
    type: "confirm_card",
    status: "active",
    artifact_id: artifact.id,
    card_kind: "plan_detail",
    summary_zh: summary,
    card_title: data.card_title,
  };

  return {
    ok: true,
    artifact_id: artifact.id,
    summary_zh: summary,
    card,
    preview: formatPlanDetailCardBody(data),
  };
}

export { loadSamplePlanAllocation, loadSamplePlanDetail };
