import { planCheckConflicts } from "@/harness/verify/plan";

export async function runPlanCheckConflicts(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const step = Number(input.step ?? 1) as 1 | 2;
  const payload = input.payload;
  if (!payload || typeof payload !== "object") {
    return { ok: false, preview: "", error: "缺少 payload。" };
  }

  const result = planCheckConflicts(
    payload as import("@/lib/plan/types").PlanAllocationPayload,
    step,
    (input.context ?? {}) as import("@/harness/verify/plan").PlanHookContext,
  );

  return {
    ok: result.ok,
    preview: result.ok ? "Hook1 通过。" : result.failures.join("\n"),
    data: result,
    error: result.ok ? undefined : "方案矛盾清单",
  };
}
