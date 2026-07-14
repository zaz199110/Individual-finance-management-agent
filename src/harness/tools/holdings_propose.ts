import { getSupabase } from "@/lib/supabase/server";
import { markConversationPendingArtifact } from "@/lib/profile/confirm";
import { holdingsPropose } from "@/lib/portfolio/propose";
import type { HoldingsProposePayload } from "@/lib/portfolio/types";

export async function runHoldingsPropose(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const payload = input as unknown as HoldingsProposePayload;
  const supabase = await getSupabase();
  const result = await holdingsPropose(supabase, {
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

export { loadSampleHoldingsInitial } from "@/lib/portfolio/propose";
