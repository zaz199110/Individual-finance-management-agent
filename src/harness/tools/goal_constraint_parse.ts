import { parseGoalChoiceFormat } from "@/lib/profile/goal-constraint";
import type { GoalType } from "@/lib/profile/goal-constraint";
import { goalDisplayName } from "@/lib/profile/goal-labels";

export async function runGoalConstraintParse(
  input: Record<string, unknown>,
): Promise<{ ok: boolean; preview: string; data?: unknown; error?: string }> {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const goalType = typeof input.goal_type === "string" ? input.goal_type : undefined;

  if (!text) {
    return { ok: false, preview: "", error: "缺少必填参数 text。" };
  }
  if (!goalType) {
    return { ok: false, preview: "", error: "缺少必填参数 goal_type。" };
  }

  const parsed = parseGoalChoiceFormat(text, goalType as GoalType);

  if (!parsed.ok) {
    return { ok: false, preview: "", error: parsed.error };
  }

  return {
    ok: true,
    preview: `已解析「${goalDisplayName(goalType)}」目标约束，准备确认。`,
    data: {
      goal_type: goalType,
      investment_constraints: parsed.investment_constraints,
      principal_amount: (parsed.investment_constraints as unknown as Record<string, unknown>)?.principal_amount ?? 0,
      monthly_amount: (parsed.investment_constraints as unknown as Record<string, unknown>)?.monthly_amount ?? 5000,
    },
  };
}
