import type { SupabaseClient } from "@supabase/supabase-js";
import { profileRead } from "@/lib/profile/read";
import type { PlanReadResult } from "./types";

export async function planRead(
  supabase: SupabaseClient | null,
  goalConstraintId?: string | null,
): Promise<PlanReadResult> {
  const profile = await profileRead(supabase);
  const eligible = profile.eligible_groups;
  const n = eligible.length;

  let goalId = goalConstraintId ?? null;
  if (!goalId && n === 1) {
    goalId = eligible[0]!.goal_constraint_id;
  }

  let hasStep1 = false;
  let hasStep2Current = false;
  let currentPlanId: string | null = null;

  if (supabase && goalId) {
    // 并行查询 step1 和 step2，减少串行等待
    const [step1Result, step2Result] = await Promise.all([
      supabase
        .from("allocation_plans")
        .select("id")
        .eq("goal_constraint_id", goalId)
        .eq("plan_step", 1)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("allocation_plans")
        .select("id")
        .eq("goal_constraint_id", goalId)
        .eq("plan_step", 2)
        .eq("is_current", true)
        .maybeSingle(),
    ]);
    hasStep1 = (step1Result.data?.length ?? 0) > 0;
    hasStep2Current = Boolean(step2Result.data);
    currentPlanId = (step2Result.data?.id as string | undefined) ?? null;
  }

  const lines = [
    `完善投资需求组（N）：${n}`,
    goalId ? `当前目标：${eligible.find((g) => g.goal_constraint_id === goalId)?.display_name ?? goalId}` : "尚未选定目标场景",
    hasStep1 ? "大类配置：已确认" : "大类配置：未完成",
    hasStep2Current ? "明细方案：已确认（is_current）" : "明细方案：未完成",
  ];

  return {
    n,
    eligible_groups: eligible,
    goal_constraint_id: goalId,
    has_step1: hasStep1,
    has_step2_current: hasStep2Current,
    current_plan_id: currentPlanId,
    summary: lines.join("\n"),
  };
}

export async function resolveGoalForPlan(
  supabase: SupabaseClient,
  goalConstraintId?: string,
): Promise<{ ok: boolean; goalId?: string; profileVersionId?: string; error?: string }> {
  const read = await planRead(supabase, goalConstraintId);
  if (read.n === 0) {
    return { ok: false, error: "没有完善的投资需求组，请先在需求梳理 Tab 完成报告发布。" };
  }
  const goalId = goalConstraintId ?? read.goal_constraint_id;
  if (!goalId || !read.eligible_groups.some((g) => g.goal_constraint_id === goalId)) {
    return { ok: false, error: "请指定有效的完善投资需求组（goal_constraint_id）。" };
  }

  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select("profile_version_id")
    .eq("id", goalId)
    .maybeSingle();

  if (!goal?.profile_version_id) {
    return { ok: false, error: "未找到目标约束。" };
  }

  return {
    ok: true,
    goalId,
    profileVersionId: goal.profile_version_id as string,
  };
}
