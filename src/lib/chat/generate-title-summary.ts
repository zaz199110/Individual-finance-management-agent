import { completeText } from "@/lib/llm/invoke";
import type { SlotConfig } from "@/lib/config/model-providers";
import { ensureModelSlot } from "@/lib/supabase/server";
import { summarizeFirstQuestion } from "@/lib/chat/conversation-title";
import { sanitizeUserContent } from "@/lib/chat/user-content";

function rowToConfig(row: {
  api_base_url: string | null;
  api_key_encrypted: string | null;
  model_name: string | null;
}): SlotConfig | null {
  if (!row.api_base_url || !row.api_key_encrypted) return null;
  return {
    api_base_url: row.api_base_url,
    api_key: row.api_key_encrypted,
    model_name: row.model_name ?? "mimo-v2.5",
    provider: /anthropic|xiaomimimo/i.test(row.api_base_url) ? "mimo" : "deepseek",
  };
}

const TITLE_SYSTEM = `你是对话标题助手。根据用户首条问题，输出一条不超过 20 个汉字的短标题摘要。
要求：只输出摘要本身；不要引号；不要【】；不要标点开头；不要解释。`;

/** LLM 摘要；失败时降级为截断 */
export async function generateTitleSummary(userContent: string): Promise<string> {
  const cleaned = sanitizeUserContent(userContent);
  if (!cleaned) return "未命名对话";

  try {
    const reasoning = await ensureModelSlot("reasoning");
    if (!reasoning) {
      return summarizeFirstQuestion(cleaned);
    }
    const cfg = rowToConfig(reasoning);
    if (!cfg) return summarizeFirstQuestion(cleaned);

    const raw = await completeText(cfg, {
      system: TITLE_SYSTEM,
      messages: [{ role: "user", content: cleaned }],
      max_tokens: 48,
      temperature: 0.2,
    });

    const summary = sanitizeUserContent(raw)
      .replace(/[【】]/g, "")
      .replace(/-/g, " ")
      .replace(/^["'「」]+|["'「」]+$/g, "")
      .trim();

    if (!summary) return summarizeFirstQuestion(cleaned);
    if (summary.length > 22) return `${summary.slice(0, 20)}…`;
    return summary;
  } catch {
    return summarizeFirstQuestion(cleaned);
  }
}
