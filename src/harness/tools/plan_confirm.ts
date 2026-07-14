import { getSupabase } from "@/lib/supabase/server";
import { syncConversationAfterConfirm } from "@/lib/profile/confirm";
import { planConfirmArtifact } from "@/lib/plan/confirm";

export async function runPlanConfirm(
  input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const artifactId = String(input.artifact_id ?? "");
  const conversationId = String(input.conversation_id ?? "");

  if (!artifactId) {
    return { ok: false, preview: "", error: "缺少 artifact_id。" };
  }

  const supabase = await getSupabase();
  const result = await planConfirmArtifact(supabase, artifactId);

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  if (supabase && conversationId) {
    await syncConversationAfterConfirm(supabase, conversationId, artifactId);
  }

  const preview =
    result.plan_step === 2
      ? `明细方案已保存（allocation_plan_id=${result.allocation_plan_id}）。可以说「生成规划书」继续。`
       : `大类配置已保存（allocation_plan_id=${result.allocation_plan_id}）。可以说「生成明细」继续第二步。`;

  return { ok: true, preview, data: result };
}
