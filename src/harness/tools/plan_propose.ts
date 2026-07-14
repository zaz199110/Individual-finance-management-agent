import { getSupabase } from "@/lib/supabase/server";
import { markConversationPendingArtifact } from "@/lib/profile/confirm";
import {
  loadSamplePlanAllocation,
  loadSamplePlanDetail,
  planProposeAllocation,
  planProposeDetail,
} from "@/lib/plan/propose";
import type { PlanAllocationPayload, PlanDetailPayload } from "@/lib/plan/types";

export async function runPlanPropose(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const kind = String(input.kind ?? "plan_allocation");
  const supabase = await getSupabase();

  if (kind === "plan_detail") {
    const payload = input as unknown as PlanDetailPayload;
    const result = await planProposeDetail(supabase, {
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      payload,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    if (supabase && result.artifact_id) {
      await markConversationPendingArtifact(supabase, ctx.conversationId, result.artifact_id);
    }
    return {
      ok: true,
      preview: result.preview ?? result.summary_zh ?? "",
      data: result,
    };
  }

  const payload = input as unknown as PlanAllocationPayload;
  const result = await planProposeAllocation(supabase, {
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    payload,
  });
  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }
  if (supabase && result.artifact_id) {
    await markConversationPendingArtifact(supabase, ctx.conversationId, result.artifact_id);
  }
  return {
    ok: true,
    preview: result.preview ?? result.summary_zh ?? "",
    data: result,
  };
}

export { loadSamplePlanAllocation, loadSamplePlanDetail };
