import { mergeReportOverlayIntoDraft } from "@/lib/reports/overlay";

export async function runReportOverlayMerge(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const draftPath = String(input.draft_path ?? "").trim();
  if (!draftPath) {
    return { ok: false, preview: "", error: "缺少 draft_path。" };
  }

  const merged = await mergeReportOverlayIntoDraft({
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    draftPath,
  });

  if (!merged.ok) {
    return { ok: false, preview: "", error: merged.error };
  }

  return {
    ok: true,
    preview: "overlay 已合并进报告草稿。",
    data: { merged_path: merged.merged_path },
  };
}
