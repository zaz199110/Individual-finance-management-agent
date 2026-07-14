import { getSupabase } from "@/lib/supabase/server";
import { syncConversationAfterConfirm } from "@/lib/profile/confirm";
import { holdingsConfirmArtifact } from "@/lib/portfolio/confirm";
import { disablePortfolioJobIfNoHoldings } from "@/lib/scheduled/jobs";

export async function runHoldingsConfirm(
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
  const result = await holdingsConfirmArtifact(supabase, artifactId);

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  if (supabase && conversationId) {
    await syncConversationAfterConfirm(supabase, conversationId, artifactId);
  }

  await disablePortfolioJobIfNoHoldings();

  return {
    ok: true,
    preview: `当前持仓已保存（holdings_version_id=${result.holdings_version_id}）。可说「重新分析」继续。`,
    data: result,
  };
}
