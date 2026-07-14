import {
  mergeReportOverlayIntoDraft,
  patchReportOverlay,
} from "@/lib/reports/overlay";

export async function runReportOverlayPatch(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const action = input.action === "delete" ? "delete" : "upsert";
  const block = (input.block ?? {}) as Record<string, unknown>;

  const patch = await patchReportOverlay({
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    action,
    block: {
      id: typeof block.id === "string" ? block.id : undefined,
      anchor: String(block.anchor ?? "append:end"),
      title: typeof block.title === "string" ? block.title : undefined,
      content: typeof block.content === "string" ? block.content : undefined,
      source_message_id:
        typeof block.source_message_id === "string"
          ? block.source_message_id
          : undefined,
    },
  });

  if (!patch.ok || !patch.overlay) {
    return { ok: false, preview: "", error: patch.error ?? "overlay patch 失败。" };
  }

  const draftPath = typeof input.draft_path === "string" ? input.draft_path : undefined;
  if (draftPath && action === "upsert") {
    const merged = await mergeReportOverlayIntoDraft({
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      draftPath,
    });
    if (!merged.ok) {
      return { ok: false, preview: "", error: merged.error };
    }
  }

  const count = patch.overlay.blocks.length;
  return {
    ok: true,
    preview: `报告 overlay 已更新（${count} 块）。`,
    data: patch.overlay,
  };
}
