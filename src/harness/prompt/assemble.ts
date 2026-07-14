import type { QueryState } from "@/harness/types";
import { rehydrateBusinessAnchors } from "@/harness/context/rehydrate";
import { buildCoreBlock } from "./blocks/core";
import { COMPLIANCE_BLOCK } from "./blocks/compliance";
import { buildMemoryBlock } from "./blocks/memory";
import { buildToolsBlock } from "./blocks/tools";
import { mergeReminders, normalizeMessages } from "./normalize";

export interface AssembledPrompt {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools: string[];
  reminders: string[];
}

/**
 * s10a Pipeline: blocks + normalized messages + reminders → { system, messages, tools }
 * 禁止把 RAG / 大 tool_result 塞进 system block。
 */
export async function assemblePrompt(
  state: QueryState,
  options?: { hookReminders?: string[] },
): Promise<AssembledPrompt> {
  const memoryBlock = await buildMemoryBlock();
  const anchors = await rehydrateBusinessAnchors(state.conversationId, {
    executionPlan: state.plan,
  });

  const blockParts = [
    buildCoreBlock(state.scene),
    COMPLIANCE_BLOCK,
    buildToolsBlock(state.scene),
  ];
  if (memoryBlock) blockParts.push(memoryBlock);

  let system = blockParts.join("\n\n");
  const reminders = [...(options?.hookReminders ?? [])];
  if (anchors.length) {
    reminders.push(`业务锚点（DB 快照）：\n${anchors.join("\n")}`);
  }
  system = mergeReminders(system, reminders);

  return {
    system,
    messages: normalizeMessages(state.messages),
    tools: [],
    reminders,
  };
}

export async function buildPromptForState(
  state: QueryState,
  hookReminders?: string[],
): Promise<AssembledPrompt> {
  return assemblePrompt(state, { hookReminders });
}
