import {
  listReasoningCandidates,
  type SlotConfig,
} from "@/lib/config/model-providers";
import { streamPrompt } from "@/lib/llm/invoke";
import type { AssembledPrompt } from "@/harness/prompt/assemble";
import { buildPromptForState } from "@/harness/prompt/assemble";
import {
  applyReactiveCompact,
  isPromptTooLongError,
} from "@/harness/context/reactive-compact";
import type { QueryState } from "@/harness/types";
import type { LlmStreamChunk } from "./client.types";

export async function* streamChatCompletion(
  prompt: AssembledPrompt,
): AsyncGenerator<LlmStreamChunk> {
  const candidates = listReasoningCandidates();
  if (!candidates.length) {
    throw new Error(
      "推理模型未配置，请设置 MIMO_* 或 LLM_*（.env.local）。",
    );
  }

  let lastError: Error | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const cfg = candidates[i]!;
    try {
      for await (const chunk of streamPrompt(cfg, prompt)) {
        if (chunk.type === "text_delta" && chunk.text) {
          yield { type: "text_delta", text: chunk.text };
        }
        if (chunk.type === "done") {
          yield { type: "done" };
          return;
        }
      }
      yield { type: "done" };
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (lastError as Error & { status?: number }).status;
      const canFallback =
        (status === 401 || status === 403) && i < candidates.length - 1;
      if (!canFallback) throw lastError;
    }
  }
  throw lastError ?? new Error("推理模型调用失败。");
}

/** HARNESS §6.4 — prompt 过长时 reactive_compact 后重试一次。 */
export async function* streamChatCompletionWithRetry(
  state: QueryState,
  hookReminders?: string[],
): AsyncGenerator<LlmStreamChunk> {
  let messages = state.messages;
  let prompt = await buildPromptForState({ ...state, messages }, hookReminders);

  try {
    yield* streamChatCompletion(prompt);
  } catch (err) {
    if (!isPromptTooLongError(err)) throw err;
    const compacted = await applyReactiveCompact(state.messages, {
      conversationId: state.conversationId,
      scene: state.scene,
    });
    messages = compacted;
    prompt = await buildPromptForState({ ...state, messages }, hookReminders);
    yield* streamChatCompletion(prompt);
  }
}

/** Non-streaming fallback for fixed replies. */
export async function* staticReply(text: string): AsyncGenerator<LlmStreamChunk> {
  yield { type: "text_delta", text };
  yield { type: "done" };
}

export type { SlotConfig };
