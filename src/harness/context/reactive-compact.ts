import type { MessageRow } from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";
import { appendTranscript } from "./transcript";
import { compactL4IfNeeded } from "./compact-history";

const TAIL_KEEP = 5;

export function isPromptTooLongError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as Error & { status?: number }).status;
  if (status === 413) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("prompt_too_long") ||
    msg.includes("context_length") ||
    msg.includes("maximum context") ||
    msg.includes("token limit") ||
    msg.includes("too many tokens")
  );
}

/**
 * HARNESS §6.4 reactive_compact — 保留尾部 + 更短摘要，供 LLM 重试一次。
 */
export async function applyReactiveCompact(
  messages: MessageRow[],
  ctx: { conversationId: string; scene?: SceneId },
): Promise<MessageRow[]> {
  appendTranscript(ctx.conversationId, messages);

  const tail = messages.slice(-TAIL_KEEP);
  const headForSummary = messages.slice(0, Math.max(0, messages.length - TAIL_KEEP));

  const l4 = await compactL4IfNeeded(headForSummary, {
    conversationId: ctx.conversationId,
    runId: "reactive",
    scene: ctx.scene,
  });

  const summaryMsg =
    l4.messages.find((m) => m.metadata && (m.metadata as Record<string, unknown>).l4_compacted) ??
    l4.messages[0];

  if (!summaryMsg) {
    return tail;
  }

  return [summaryMsg, ...tail];
}
