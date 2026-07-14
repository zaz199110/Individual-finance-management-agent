import { getSupabase } from "@/lib/supabase/server";
import { planRead } from "@/lib/plan/read";

export async function runPlanRead(
  input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const supabase = await getSupabase();
  const goalId = input.goal_constraint_id
    ? String(input.goal_constraint_id)
    : undefined;
  const result = await planRead(supabase, goalId);
  return {
    ok: true,
    preview: result.summary,
    data: result,
  };
}
