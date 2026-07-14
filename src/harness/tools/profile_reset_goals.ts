import { getSupabase } from "@/lib/supabase/server";
import { resetGoalConstraints } from "@/lib/profile/reset-goals";

export async function runProfileResetGoals(
  input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const goalType = input.goal_type ? String(input.goal_type) : undefined;
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, preview: "", error: "数据库连接不可用。" };
  }
  const result = await resetGoalConstraints(supabase, goalType ? { goal_type: goalType } : undefined);

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  if (result.deactivated === 0) {
    return { ok: true, preview: "当前没有可重置的投资约束。", data: result };
  }

  // Use goalPickLabel from goal-constraint to get Chinese labels
  const { goalPickLabel } = await import("@/lib/profile/goal-constraint");
  const labels = result.goal_types.map((gt) => goalPickLabel(gt)).join("、");

  const preview = goalType
    ? `已重置「${goalPickLabel(goalType)}」的投资约束（${result.deactivated} 项）。`
    : `已重置全部 ${result.deactivated} 个场景的投资约束（${labels}），现在可以重新设定。`;

  return { ok: true, preview, data: result };
}
