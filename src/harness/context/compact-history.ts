import { listReasoningCandidates } from "@/lib/config/model-providers";
import { completeText } from "@/lib/llm/invoke";
import type { MessageRow } from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";
import {
  getAutoCompactThresholdTokens,
  getCompactFailureCircuitBreaker,
  getMinCompactSavingsTokens,
  isL4Skipped,
} from "./compact-config";
import { appendTranscript, getTranscriptPath } from "./transcript";
import { estimateMessagesTokens } from "./token-estimate";
import type { CompactContext } from "./compact";

const failureCounts = new Map<string, number>();

export function resetCompactFailureCount(conversationId: string): void {
  failureCounts.delete(conversationId);
}

export function getCompactFailureCount(conversationId: string): number {
  return failureCounts.get(conversationId) ?? 0;
}

function isCircuitBreakerOpen(conversationId: string): boolean {
  return (
    getCompactFailureCount(conversationId) >= getCompactFailureCircuitBreaker()
  );
}

function recordFailure(conversationId: string): void {
  failureCounts.set(conversationId, getCompactFailureCount(conversationId) + 1);
}

function recordSuccess(conversationId: string): void {
  failureCounts.delete(conversationId);
}

function formatMessagesForSummary(messages: MessageRow[]): string {
  return messages
    .slice(-60)
    .map((m) => `${m.role}: ${(m.content ?? "").slice(0, 800)}`)
    .join("\n\n");
}

async function summarizeWithLlm(
  messages: MessageRow[],
  scene?: SceneId,
): Promise<string> {
  const candidates = listReasoningCandidates();
  if (!candidates.length) {
    throw new Error("推理模型未配置，无法执行 L4 摘要。");
  }

  const cfg = candidates[0]!;
  const body = formatMessagesForSummary(messages);

  return completeText(cfg, {
    system:
      "你是投资顾问助手的上下文压缩模块。将对话历史压缩为结构化摘要，保留：当前场景、用户目标、已确认 artifact、待确认项、合规约束、未完成步骤。用中文，不超过 1200 字。",
    messages: [
      {
        role: "user",
        content: `场景：${scene ?? "chat"}\n\n请摘要以下对话：\n\n${body}`,
      },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  });
}

export interface CompactL4Result {
  messages: MessageRow[];
  l4Applied: boolean;
  transcriptPath?: string;
  circuitBreakerOpen?: boolean;
}

/**
 * L4 compact_history — 超阈先写 transcript，再 LLM 摘要替换整段历史。
 */
export async function compactL4IfNeeded(
  messages: MessageRow[],
  ctx: CompactContext & { scene?: SceneId },
): Promise<CompactL4Result> {
  if (isL4Skipped() || messages.length === 0) {
    return { messages, l4Applied: false };
  }

  if (isCircuitBreakerOpen(ctx.conversationId)) {
    return { messages, l4Applied: false, circuitBreakerOpen: true };
  }

  const tokens = estimateMessagesTokens(messages);
  const threshold = getAutoCompactThresholdTokens();
  if (tokens < threshold) {
    return { messages, l4Applied: false };
  }

  const estimatedSummaryTokens = 800;
  if (tokens - estimatedSummaryTokens < getMinCompactSavingsTokens()) {
    return { messages, l4Applied: false };
  }

  const transcriptPath = appendTranscript(ctx.conversationId, messages);

  try {
    const summary = await summarizeWithLlm(messages, ctx.scene);
    recordSuccess(ctx.conversationId);

    const compacted: MessageRow = {
      id: "compact-l4-summary",
      conversation_id: ctx.conversationId,
      role: "system",
      content: `[Compacted]\n${summary.trim()}`,
      created_at: new Date().toISOString(),
      metadata: {
        l4_compacted: true,
        transcript_path: transcriptPath,
        pre_compact_message_count: messages.length,
      },
    };

    return {
      messages: [compacted],
      l4Applied: true,
      transcriptPath,
    };
  } catch {
    recordFailure(ctx.conversationId);
    return {
      messages,
      l4Applied: false,
      transcriptPath,
      circuitBreakerOpen:
        getCompactFailureCount(ctx.conversationId) >=
        getCompactFailureCircuitBreaker(),
    };
  }
}

export { getTranscriptPath };
