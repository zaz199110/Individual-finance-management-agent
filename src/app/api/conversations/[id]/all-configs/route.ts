import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { profileRead } from "@/lib/profile/read";
import { getSupabase } from "@/lib/supabase/server";

async function fetchConfigForGoal(
  supabase: SupabaseClient,
  goalId: string,
) {
  const [goal, step2Result, step1Result] = await Promise.all([
    supabase
      .from("investment_goal_constraints")
      .select(
        "display_name, goal_type, principal_amount, monthly_amount, investment_constraints",
      )
      .eq("id", goalId)
      .maybeSingle(),
    supabase
      .from("allocation_plans")
      .select("target_allocation, allocation_rationale, detailed_plan")
      .eq("goal_constraint_id", goalId)
      .eq("plan_step", 2)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("allocation_plans")
      .select("target_allocation, allocation_rationale")
      .eq("goal_constraint_id", goalId)
      .eq("plan_step", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const step2Plan = step2Result.data ?? null;
  const step1Plan = step1Result.data ?? null;

  // 始终使用 step1 的 target_allocation 作为权威来源，
  // 因为用户编辑大类配置时只更新 step1，step2 中的副本可能已过时
  const targetAllocation =
    (step1Plan?.target_allocation as Record<string, unknown> | null) ??
    (step2Plan?.target_allocation as Record<string, unknown> | null) ??
    null;

  const allocationRationale =
    (step1Plan?.allocation_rationale as string | null) ??
    (step2Plan?.allocation_rationale as string | null) ??
    null;

  const detailedPlan =
    (step2Plan?.detailed_plan as Record<string, unknown> | null) ?? null;

  const investmentConstraints =
    (goal.data?.investment_constraints as Record<string, unknown> | null) ??
    null;

  const hasStep1Data = Boolean(step1Plan);
  const hasStep2Data = Boolean(step2Plan);

  return {
    goal_constraint_id: goalId,
    scenario_name: goal.data?.display_name ?? goalId,
    goal_type: goal.data?.goal_type ?? null,
    principal_amount: (goal.data?.principal_amount as number) ?? 0,
    monthly_amount: (goal.data?.monthly_amount as number) ?? 0,
    target_allocation: targetAllocation,
    allocation_rationale: allocationRationale,
    detailed_plan: detailedPlan,
    investment_constraints: investmentConstraints,
    has_step1: hasStep1Data,
    has_step2_current: hasStep2Data,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  // Read profile to get has_basic_info / active goals, but do NOT gate on
  // isGroupEligible (which requires a published profile report). Instead, query
  // ALL active goals directly — allocation data lives in allocation_plans and
  // should be visible even if the profile report hasn't been published yet.
  const profile = await profileRead(supabase);

  // Collect all active goal IDs (both eligible and not-yet-eligible groups
  // may have allocation data we want to show).
  const eligibleIds = new Set(profile.eligible_groups.map((g) => g.goal_constraint_id));
  const incompleteIds = profile.incomplete_groups.map((g) => g.goal_constraint_id);
  const allGoalIds = [...eligibleIds, ...incompleteIds];

  if (allGoalIds.length === 0 && !profile.has_basic_info) {
    return NextResponse.json({
      has_data: false,
      reason: "尚未完善个人画像信息",
      has_profile: false,
      scenarios: [],
    });
  }

  // Also query active goals directly to catch any that may not appear in
  // eligible_groups or incomplete_groups (e.g. profile_version mismatch).
  const { data: activeGoals } = await supabase
    .from("investment_goal_constraints")
    .select("id")
    .eq("is_active", true)
    .not("confirmed_at", "is", null);

  const activeGoalIds = (activeGoals ?? []).map((g) => g.id as string);
  const uniqueGoalIds = [...new Set([...allGoalIds, ...activeGoalIds])];

  // Fetch config for all goals in parallel
  const scenarios = await Promise.all(
    uniqueGoalIds.map((goalId) => fetchConfigForGoal(supabase, goalId)),
  );

  // Only include scenarios that have at least step1 or step2 data
  const activeScenarios = scenarios.filter(
    (s) => s.target_allocation || s.detailed_plan,
  );

  return NextResponse.json({
    has_data: activeScenarios.length > 0 || profile.eligible_groups.length > 0,
    has_profile: profile.has_basic_info,
    conversation_id: conversationId,
    eligible_count: profile.eligible_groups.length,
    scenario_count: activeScenarios.length,
    scenarios: activeScenarios.map((s) => ({
      ...s,
      has_data: Boolean(s.target_allocation || s.detailed_plan),
    })),
  });
}
