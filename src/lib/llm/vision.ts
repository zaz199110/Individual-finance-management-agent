import type { SlotConfig } from "@/lib/config/model-providers";
import {
  anthropicMessagesUrl,
  openaiChatUrl,
  resolveProtocol,
} from "@/lib/llm/invoke";

export interface VisionCompleteInput {
  text: string;
  imageUrls: string[];
  max_tokens?: number;
  temperature?: number;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    };

type OpenAIContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

function openaiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function anthropicImageBlock(url: string): AnthropicContentBlock | null {
  const dataMatch = url.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: dataMatch[1]!,
        data: dataMatch[2]!,
      },
    };
  }
  if (/^https?:\/\//i.test(url)) {
    return {
      type: "image",
      source: { type: "url", url },
    };
  }
  return null;
}

export function buildAnthropicVisionContent(
  text: string,
  imageUrls: string[],
): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [{ type: "text", text }];
  for (const url of imageUrls) {
    const image = anthropicImageBlock(url);
    if (image) blocks.push(image);
  }
  return blocks;
}

export function buildOpenAIVisionContent(
  text: string,
  imageUrls: string[],
): OpenAIContentBlock[] {
  const blocks: OpenAIContentBlock[] = [{ type: "text", text }];
  for (const url of imageUrls) {
    blocks.push({ type: "image_url", image_url: { url } });
  }
  return blocks;
}

/** 多模态补全：兼容 OpenAI Chat Completions 与 Anthropic Messages（Mimo 等） */
export async function completeVision(
  cfg: SlotConfig,
  input: VisionCompleteInput,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const urls = input.imageUrls.filter(Boolean);
  if (!urls.length) {
    return { ok: false, error: "未提供图片。" };
  }

  const protocol = resolveProtocol(cfg);
  const maxTokens = input.max_tokens ?? 3000;
  const temperature = input.temperature ?? 0.1;

  try {
    if (protocol === "anthropic") {
      const res = await fetch(anthropicMessagesUrl(cfg.api_base_url), {
        method: "POST",
        headers: anthropicHeaders(cfg.api_key),
        body: JSON.stringify({
          model: cfg.model_name,
          max_tokens: maxTokens,
          temperature,
          messages: [
            {
              role: "user",
              content: buildAnthropicVisionContent(input.text, urls),
            },
          ],
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 160);
        return {
          ok: false,
          error: `Vision API ${res.status}${detail ? `：${detail}` : ""}`,
        };
      }
      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      return text ? { ok: true, text } : { ok: false, error: "Vision 返回为空。" };
    }

    const res = await fetch(openaiChatUrl(cfg.api_base_url), {
      method: "POST",
      headers: openaiHeaders(cfg.api_key),
      body: JSON.stringify({
        model: cfg.model_name,
        messages: [
          {
            role: "user",
            content: buildOpenAIVisionContent(input.text, urls),
          },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 160);
      return {
        ok: false,
        error: `Vision API ${res.status}${detail ? `：${detail}` : ""}`,
      };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { ok: true, text } : { ok: false, error: "Vision 返回为空。" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Vision 调用失败。",
    };
  }
}
