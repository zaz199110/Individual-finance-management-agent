import type { SupabaseClient } from "@supabase/supabase-js";
import { proposePlanAllocation } from "./allocation-propose";
import type { PlanAllocationPayload } from "./types";
import { validatePlanAllocation } from "./validate";
import type { BasicInfo } from "@/lib/profile/types";

export interface BuildAllocationResult {
  ok: boolean;
  payload?: PlanAllocationPayload;
  allocation_citations?: PlanAllocationPayload["allocation_citations"];
  error?: string;
}

export async function buildPlanAllocationFormal(
  supabase: SupabaseClient | null,
  params: { goalConstraintId: string },
): Promise<BuildAllocationResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select(
      "id, display_name, profile_version_id, goal_type, investment_constraints, principal_amount, monthly_amount",
    )
    .eq("id", params.goalConstraintId)
    .maybeSingle();

  if (!goal) {
    return { ok: false, error: "未找到投资需求组。" };
  }

  let basicInfo: BasicInfo | undefined;
  if (goal.profile_version_id) {
    const { data: profile } = await supabase
      .from("profile_versions")
      .select("basic_info")
      .eq("id", goal.profile_version_id)
      .maybeSingle();
    if (profile?.basic_info) {
      basicInfo = profile.basic_info as BasicInfo;
    }
  }

  const result = await proposePlanAllocation({
    goal_constraint_id: params.goalConstraintId,
    goal_display_name: goal.display_name,
    goal_type: goal.goal_type,
    profile_version_id: goal.profile_version_id,
    constraints: goal.investment_constraints as import("@/lib/profile/types").InvestmentConstraints,
    principal_amount: goal.principal_amount,
    monthly_amount: goal.monthly_amount,
    basic_info: basicInfo,
  });

  if (!result.ok || !result.payload) {
    return { ok: false, error: result.error };
  }

  const validation = validatePlanAllocation(result.payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const payload: PlanAllocationPayload = {
    ...validation.data,
    allocation_citations: result.allocation_citations,
  };

  return {
    ok: true,
    payload,
    allocation_citations: result.allocation_citations,
  };
}
