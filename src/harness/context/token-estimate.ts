import type { MessageRow } from "@/harness/types";

/** 粗估 token：中英混合约 3.5 字符 / token */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function estimateMessagesTokens(messages: MessageRow[]): number {
  return messages.reduce(
    (sum, m) => sum + estimateTextTokens(m.content ?? "") + 8,
    0,
  );
}
