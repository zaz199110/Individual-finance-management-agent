import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResetGoalsResult {
  ok: boolean;
  deactivated: number;
  goal_types: string[];
  error?: string;
}

/**
 * 将指定（或全部）活跃的投资目标约束设为 is_active=false。
 * 如提供 goal_type 则仅重置该场景；否则重置全部。
 */
export async function resetGoalConstraints(
  supabase: SupabaseClient,
  options?: { goal_type?: string },
): Promise<ResetGoalsResult> {
  // 先查出将被 deactivate 的 goal_type，用于返回摘要
  let selectQ = supabase
    .from("investment_goal_constraints")
    .select("goal_type")
    .eq("is_active", true);

  if (options?.goal_type) {
    selectQ = selectQ.eq("goal_type", options.goal_type);
  }

  const { data: before, error: selectErr } = await selectQ;
  if (selectErr) {
    return { ok: false, deactivated: 0, goal_types: [], error: selectErr.message };
  }

  if (!before || before.length === 0) {
    return { ok: true, deactivated: 0, goal_types: [] };
  }

  // 执行 deactivate
  let updateQ = supabase
    .from("investment_goal_constraints")
    .update({ is_active: false })
    .eq("is_active", true);

  if (options?.goal_type) {
    updateQ = updateQ.eq("goal_type", options.goal_type);
  }

  const { error: updateErr } = await updateQ;
  if (updateErr) {
    return { ok: false, deactivated: 0, goal_types: [], error: updateErr.message };
  }

  const goalTypes = before.map((r) => r.goal_type as string);
  return { ok: true, deactivated: goalTypes.length, goal_types: goalTypes };
}
