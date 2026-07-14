import type { SupabaseClient } from "@supabase/supabase-js";
import { FUND_L0_REGISTRY } from "@/harness/infra/fund_knowledge/l0-registry";
import { proposePlanDetail } from "./detail-propose";
import { validatePlanL0Pool } from "./l0-pool";
import type { PlanAllocationPayload, PlanDetailPayload } from "./types";
import { validatePlanDetail } from "./validate";

export { validatePlanL0Pool, PLAN_L0_POOL_CODES } from "./l0-pool";

export const L0_STUB_FUND_CODES = new Set(Object.keys(FUND_L0_REGISTRY));

export function validateL0StubFunds(payload: PlanDetailPayload): {
  ok: boolean;
  error?: string;
} {
  return validatePlanL0Pool(payload);
}

export interface BuildPlanDetailResult {
  ok: boolean;
  payload?: PlanDetailPayload;
  web_summary?: string;
  error?: string;
}

export async function buildPlanDetailFormal(
  supabase: SupabaseClient | null,
  params: { goalConstraintId: string },
): Promise<BuildPlanDetailResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  // 并行查询 goal 约束和 step1 配置，减少串行等待
  const [goalResult, step1Result] = await Promise.all([
    supabase
      .from("investment_goal_constraints")
      .select(
        "id, display_name, profile_version_id, goal_type, investment_constraints, principal_amount, monthly_amount",
      )
      .eq("id", params.goalConstraintId)
      .maybeSingle(),
    supabase
      .from("allocation_plans")
      .select("target_allocation")
      .eq("goal_constraint_id", params.goalConstraintId)
      .eq("plan_step", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const goal = goalResult.data;
  if (!goal) {
    return { ok: false, error: "未找到投资需求组。" };
  }

  const step1 = step1Result.data;
  if (!step1?.target_allocation) {
    return { ok: false, error: "请先确认大类资产配置（第一步）。" };
  }

  const proposed = await proposePlanDetail({
    goal_constraint_id: params.goalConstraintId,
    goal_display_name: goal.display_name,
    goal_type: goal.goal_type,
    profile_version_id: goal.profile_version_id,
    constraints: goal.investment_constraints as import("@/lib/profile/types").InvestmentConstraints,
    principal_amount: goal.principal_amount,
    monthly_amount: goal.monthly_amount,
    target_allocation: step1.target_allocation as PlanAllocationPayload["target_allocation"],
  });

  if (!proposed.ok || !proposed.payload) {
    return { ok: false, error: proposed.error ?? "生成明细失败。" };
  }

  const validation = validatePlanDetail(proposed.payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  return {
    ok: true,
    payload: validation.data,
    web_summary: proposed.payload.web_citations?.[0]?.snippet,
  };
}

export async function buildPlanDetailWithWeb(
  supabase: SupabaseClient | null,
  params: {
    goalConstraintId: string;
    goalDisplayName?: string;
  },
): Promise<BuildPlanDetailResult> {
  return buildPlanDetailFormal(supabase, { goalConstraintId: params.goalConstraintId });
}
