import { getSupabase } from "@/lib/supabase/server";
import { sanitizeUserContent } from "@/lib/chat/user-content";

export interface EditResendResult {
  ok: true;
  message_id: string;
  content: string;
}

export type EditResendError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "VALIDATION"; message: string };

/** Cursor 式：更新最后一条 user 消息并截断其后所有 messages */
export async function editResendUserMessage(
  conversationId: string,
  messageId: string,
  rawContent: string,
): Promise<EditResendResult | EditResendError> {
  const content = sanitizeUserContent(rawContent);
  if (!content) {
    return { code: "VALIDATION", message: "消息不能为空。" };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return { code: "NOT_FOUND", message: "数据库未配置。" };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, metadata")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { code: "NOT_FOUND", message: "对话不存在。" };
  }

  const metadata = conversation.metadata as { has_unconfirmed?: boolean };
  if (metadata?.has_unconfirmed) {
    return {
      code: "FORBIDDEN",
      message: "这条对话有待确认内容，请先处理后再编辑消息。",
    };
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const rows = messages ?? [];
  const target = rows.find((m) => m.id === messageId);
  if (!target || target.role !== "user") {
    return { code: "NOT_FOUND", message: "消息不存在或不可编辑。" };
  }

  const userRows = rows.filter((m) => m.role === "user");
  const lastUser = userRows[userRows.length - 1];
  if (lastUser?.id !== messageId) {
    return { code: "FORBIDDEN", message: "仅可编辑最后一条用户消息。" };
  }

  const targetIdx = rows.findIndex((m) => m.id === messageId);
  const toDelete = rows.slice(targetIdx + 1).map((m) => m.id);

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from("messages").delete().in("id", toDelete);
    if (delErr) {
      return { code: "VALIDATION", message: delErr.message };
    }
  }

  const { error: updErr } = await supabase
    .from("messages")
    .update({ content })
    .eq("id", messageId);

  if (updErr) {
    return { code: "VALIDATION", message: updErr.message };
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, message_id: messageId, content };
}
