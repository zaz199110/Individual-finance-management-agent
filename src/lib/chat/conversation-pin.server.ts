import type { SupabaseClient } from "@supabase/supabase-js";
import { mergePinMetadata } from "./conversation-pin";

/** 单置顶互斥：取消除 exceptId 外所有已置顶对话 */
export async function unpinOtherConversations(
  supabase: SupabaseClient,
  exceptId: string,
): Promise<void> {
  const { data: others } = await supabase
    .from("conversations")
    .select("id, metadata")
    .eq("metadata->>pinned", "true")
    .neq("id", exceptId);

  if (!others?.length) return;

  const now = new Date().toISOString();
  await Promise.all(
    others.map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return supabase
        .from("conversations")
        .update({
          metadata: mergePinMetadata(meta, false, null),
          updated_at: now,
        })
        .eq("id", row.id);
    }),
  );
}
