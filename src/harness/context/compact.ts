import fs from "node:fs";
import path from "node:path";
import type { MessageRow } from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";
import { getRunWorkspacePath } from "@/harness/runs/workspace";
import { compactL4IfNeeded } from "./compact-history";

const TOOL_RESULT_BUDGET = 2000;
const SNIP_HEAD = 2;
const SNIP_TAIL = 24;
const SNIP_THRESHOLD = 40;

export interface CompactContext {
  conversationId: string;
  runId: string;
  scene?: SceneId;
}

function spillToolResult(
  ctx: CompactContext,
  messageId: string,
  content: string,
): string {
  const dir = path.join(
    getRunWorkspacePath(ctx.conversationId, ctx.runId),
    "tool-results",
  );
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${messageId}.txt`);
  fs.writeFileSync(filePath, content, "utf8");
  const preview = content.slice(0, 280);
  return `[tool_result 已落盘]\n预览：${preview}${content.length > 280 ? "…" : ""}`;
}

/** L3 — large tool_result spill to run directory */
function compactL3(messages: MessageRow[], ctx: CompactContext): MessageRow[] {
  return messages.map((m) => {
    const content = m.content ?? "";
    const isToolHeavy =
      content.length > TOOL_RESULT_BUDGET ||
      (m.metadata as Record<string, unknown> | undefined)?.role === "tool_result";

    if (!isToolHeavy || content.length <= TOOL_RESULT_BUDGET) return m;

    return {
      ...m,
      content: spillToolResult(ctx, m.id, content),
      metadata: {
        ...(m.metadata ?? {}),
        tool_result_spilled: true,
        tool_result_path: `tool-results/${m.id}.txt`,
      },
    };
  });
}

/** L1 — snip middle messages when over threshold */
function compactL1(messages: MessageRow[]): MessageRow[] {
  if (messages.length <= SNIP_THRESHOLD) return messages;
  const head = messages.slice(0, SNIP_HEAD);
  const tail = messages.slice(-SNIP_TAIL);
  const omitted = messages.length - SNIP_HEAD - SNIP_TAIL;
  const marker: MessageRow = {
    id: "compact-l1-marker",
    conversation_id: messages[0]?.conversation_id ?? "",
    role: "system",
    content: `[已省略中间 ${omitted} 条消息以节省上下文]`,
    created_at: new Date().toISOString(),
  };
  return [...head, marker, ...tail];
}

/** L2 — replace old spilled previews with micro placeholder */
function compactL2(messages: MessageRow[]): MessageRow[] {
  const cutoff = Math.max(0, messages.length - SNIP_TAIL);
  return messages.map((m, i) => {
    const meta = m.metadata as Record<string, unknown> | undefined;
    if (i < cutoff && meta?.tool_result_spilled) {
      return {
        ...m,
        content: "[较早 tool_result 已压缩]",
      };
    }
    return m;
  });
}

/**
 * s06 compact pipeline — L3 → L1 → L2 → L4（超阈）→ 业务锚点由 assemble 重注入。
 */
export async function runCompactPipeline(
  messages: MessageRow[],
  ctx: CompactContext,
): Promise<MessageRow[]> {
  let working = compactL3(messages, ctx);
  working = compactL1(working);
  working = compactL2(working);
  const l4 = await compactL4IfNeeded(working, ctx);
  return l4.messages;
}

export { rehydrateBusinessAnchors } from "./rehydrate";
