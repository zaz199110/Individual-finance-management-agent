import { getSupabase } from "@/lib/supabase/server";
import type { ContentBlockHandoff } from "@/harness/types";

type HandoffStatus = ContentBlockHandoff["status"];

function mapBlocks(
  blocks: unknown[],
  messageId: string,
  nextStatus: HandoffStatus,
): unknown[] {
  return blocks.map((block) => {
    if (
      typeof block === "object" &&
      block &&
      (block as { type?: string }).type === "handoff_card"
    ) {
      return { ...(block as object), status: nextStatus };
    }
    return block;
  });
}

export async function updateHandoffCardStatus(
  messageId: string,
  status: HandoffStatus,
): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;

  const { data: row } = await supabase
    .from("messages")
    .select("metadata")
    .eq("id", messageId)
    .maybeSingle();

  if (!row?.metadata) return false;

  const metadata = row.metadata as { content_blocks?: unknown[] };
  const blocks = metadata.content_blocks;
  if (!Array.isArray(blocks)) return false;

  const { error } = await supabase
    .from("messages")
    .update({
      metadata: {
        ...metadata,
        content_blocks: mapBlocks(blocks, messageId, status),
      },
    })
    .eq("id", messageId);

  return !error;
}

export async function stalePendingHandoffCards(
  conversationId: string,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;

  const { data: rows } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(20);

  for (const row of rows ?? []) {
    const metadata = row.metadata as { content_blocks?: unknown[] } | null;
    const blocks = metadata?.content_blocks;
    if (!Array.isArray(blocks)) continue;

    const hasPending = blocks.some(
      (b) =>
        typeof b === "object" &&
        b &&
        (b as { type?: string; status?: string }).type === "handoff_card" &&
        (b as { status?: string }).status === "pending",
    );
    if (!hasPending) continue;

    await updateHandoffCardStatus(row.id, "stale");
  }
}
