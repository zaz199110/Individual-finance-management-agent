import { getSupabase } from "@/lib/supabase/server";
import {
  profileConfirmArtifact,
  syncConversationAfterConfirm,
} from "@/lib/profile/confirm";

export async function runProfileConfirm(
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
  const result = await profileConfirmArtifact(supabase, artifactId);

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  if (supabase && conversationId) {
    await syncConversationAfterConfirm(supabase, conversationId, artifactId);
    // 投资需求报告不再走逐组队列，统一走 combine 合体版管线（draftAllGoalsProfileReport）
    // 用户说"生成报告"时由 scene_profile 触发合并报告生成
  }

  const preview =
    result.goal_constraint_id != null
      ? "本组投资需求已保存。"
      : "基本情况已保存。";

  return { ok: true, preview, data: result };
}
