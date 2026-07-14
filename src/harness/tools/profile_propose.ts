import { getSupabase } from "@/lib/supabase/server";
import {
  markConversationPendingArtifact,
} from "@/lib/profile/confirm";
import {
  loadSampleBasicPayload,
  profileProposeBasic,
  profileProposeGoalConstraint,
} from "@/lib/profile/propose";
import type {
  GoalConstraintProposePayload,
  ProfileBasicProposePayload,
} from "@/lib/profile/types";

export async function runProfilePropose(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const kind = String(input.kind ?? "profile_basic");
  const supabase = await getSupabase();

  if (kind === "goal_constraint") {
    const payload = input as unknown as GoalConstraintProposePayload;
    const result = await profileProposeGoalConstraint(supabase, {
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

  const payload = input as unknown as ProfileBasicProposePayload;
  if (!payload.basic_info) {
    return { ok: false, preview: "", error: "缺少 basic_info。" };
  }

  const result = await profileProposeBasic(supabase, {
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

export { loadSampleBasicPayload };
