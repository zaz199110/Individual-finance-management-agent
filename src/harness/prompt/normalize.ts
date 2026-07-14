import type { MessageRow } from "@/harness/types";

export interface NormalizedMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const TOOL_RESULT_PLACEHOLDER = "[工具结果已落盘，见 run tool-results/]";

/** Normalize DB messages → LLM API messages. Tool blocks stay in message stream, not system. */
export function normalizeMessages(messages: MessageRow[]): NormalizedMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      let content = m.content ?? "";

      const meta = m.metadata as Record<string, unknown> | null | undefined;
      if (meta?.tool_result_spilled) {
        content = `${content}\n\n${TOOL_RESULT_PLACEHOLDER}`;
      }

      const blocks = meta?.content_blocks as Array<{ type: string; text?: string }> | undefined;
      if (!content && blocks?.length) {
        content = blocks
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("\n");
      }

      return { role: m.role as "user" | "assistant", content: content.trim() };
    })
    .filter((m) => m.content.length > 0);
}

export function mergeReminders(
  system: string,
  reminders: string[],
): string {
  if (!reminders.length) return system;
  return `${system}\n\n--- 本轮提醒 ---\n${reminders.join("\n")}`;
}
