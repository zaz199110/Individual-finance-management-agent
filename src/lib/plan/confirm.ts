import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getProposeArtifact,
  markArtifactConfirmed,
  readArtifactPayload,
} from "@/lib/profile/artifacts";
import type { PlanAllocationPayload, PlanDetailPayload } from "./types";
import {
  validatePlanAllocation,
  validatePlanDetail,
} from "./validate";

export interface PlanConfirmResult {
  ok: boolean;
  allocation_plan_id?: string;
  goal_constraint_id?: string;
  plan_step?: number;
  error?: string;
}

export async function planConfirmArtifact(
  supabase: SupabaseClient | null,
  artifactId: string,
): Promise<PlanConfirmResult> {
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

  if (artifact.kind === "plan_allocation") {
    return confirmPlanAllocation(supabase, artifactId, artifact.payload_path);
  }
  if (artifact.kind === "plan_detail") {
    return confirmPlanDetail(supabase, artifactId, artifact.payload_path);
  }

  return { ok: false, error: `暂不支持确认 kind=${artifact.kind}。` };
}

async function confirmPlanAllocation(
  supabase: SupabaseClient,
  artifactId: string,
  payloadPath: string,
): Promise<PlanConfirmResult> {
  const payload = readArtifactPayload(payloadPath) as unknown as PlanAllocationPayload;
  const validation = validatePlanAllocation(payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const data = validation.data;
  const profileVersionId = data.profile_version_id;
  if (!profileVersionId) {
    return { ok: false, error: "缺少 profile_version_id。" };
  }

  // 将旧 step1 记录的 is_current 置为 false（对齐 step2 逻辑）
  await supabase
    .from("allocation_plans")
    .update({ is_current: false })
    .eq("goal_constraint_id", data.goal_constraint_id)
    .eq("plan_step", 1)
    .eq("is_current", true);

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("allocation_plans")
    .insert({
      goal_constraint_id: data.goal_constraint_id,
      profile_version_id: profileVersionId,
      plan_step: 1,
      is_current: true,
      target_allocation: data.target_allocation,
      allocation_rationale: data.allocation_rationale,
      allocation_citations: data.allocation_citations ?? null,
      allocation_confirmed_at: now,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "写入 allocation_plans（step 1）失败。" };
  }

  await markArtifactConfirmed(supabase, artifactId);

  return {
    ok: true,
    allocation_plan_id: inserted.id as string,
    goal_constraint_id: data.goal_constraint_id,
    plan_step: 1,
  };
}

async function confirmPlanDetail(
  supabase: SupabaseClient,
  artifactId: string,
  payloadPath: string,
): Promise<PlanConfirmResult> {
  const payload = readArtifactPayload(payloadPath) as unknown as PlanDetailPayload;
  const validation = validatePlanDetail(payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const data = validation.data;
  const profileVersionId = data.profile_version_id;
  if (!profileVersionId) {
    return { ok: false, error: "缺少 profile_version_id。" };
  }

  await supabase
    .from("allocation_plans")
    .update({ is_current: false })
    .eq("goal_constraint_id", data.goal_constraint_id)
    .eq("plan_step", 2)
    .eq("is_current", true);

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("allocation_plans")
    .insert({
      goal_constraint_id: data.goal_constraint_id,
      profile_version_id: profileVersionId,
      plan_step: 2,
      is_current: true,
      // step2 不再存储 target_allocation 副本，大类配置以 step1 为准
      detailed_plan: data.detailed_plan,
      execution_schedule: data.execution_schedule ?? null,
      web_citations: data.web_citations ?? null,
      confirmed_at: now,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "写入 allocation_plans（step 2）失败。" };
  }

  await markArtifactConfirmed(supabase, artifactId);

  return {
    ok: true,
    allocation_plan_id: inserted.id as string,
    goal_constraint_id: data.goal_constraint_id,
    plan_step: 2,
  };
}
