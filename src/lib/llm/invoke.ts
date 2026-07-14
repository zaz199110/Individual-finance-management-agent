import type { AssembledPrompt } from "@/harness/prompt/assemble";
import type { SlotConfig } from "@/lib/config/model-providers";

export type ApiProtocol = "openai" | "anthropic";

const ANTHROPIC_VERSION = "2023-06-01";

export function resolveProtocol(cfg: SlotConfig): ApiProtocol {
  if (cfg.provider !== "mimo") return "openai";
  if (process.env.MIMO_API_PROTOCOL === "openai") return "openai";
  if (process.env.MIMO_API_PROTOCOL === "anthropic") return "anthropic";
  if (/\/anthropic(\/|$)/i.test(cfg.api_base_url)) return "anthropic";
  return "openai";
}

export function anthropicMessagesUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/$/, "");
  if (b.endsWith("/v1/messages")) return b;
  return `${b}/v1/messages`;
}

export function openaiChatUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/$/, "");
  if (b.endsWith("/chat/completions")) return b;
  return `${b}/chat/completions`;
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

function openaiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function probeModel(
  cfg: SlotConfig,
  userMessage = "ping",
): Promise<{ ok: boolean; message: string }> {
  try {
    const protocol = resolveProtocol(cfg);
    if (protocol === "anthropic") {
      const res = await fetch(anthropicMessagesUrl(cfg.api_base_url), {
        method: "POST",
        headers: anthropicHeaders(cfg.api_key),
        body: JSON.stringify({
          model: cfg.model_name,
          max_tokens: 32,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (res.ok) {
        return { ok: true, message: `${cfg.provider}（Anthropic）检测通过。` };
      }
      const text = await res.text();
      return {
        ok: false,
        message: `检测失败（${res.status}）：${text.slice(0, 120)}`,
      };
    }

    const res = await fetch(openaiChatUrl(cfg.api_base_url), {
      method: "POST",
      headers: openaiHeaders(cfg.api_key),
      body: JSON.stringify({
        model: cfg.model_name,
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 16,
      }),
    });
    if (res.ok) {
      return { ok: true, message: `${cfg.provider}（OpenAI）检测通过。` };
    }
    const text = await res.text();
    return {
      ok: false,
      message: `检测失败（${res.status}）：${text.slice(0, 120)}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "网络错误",
    };
  }
}

export async function completeText(
  cfg: SlotConfig,
  input: {
    system: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
  },
): Promise<string> {
  const protocol = resolveProtocol(cfg);
  if (protocol === "anthropic") {
    const res = await fetch(anthropicMessagesUrl(cfg.api_base_url), {
      method: "POST",
      headers: anthropicHeaders(cfg.api_key),
      body: JSON.stringify({
        model: cfg.model_name,
        max_tokens: input.max_tokens ?? 512,
        temperature: input.temperature ?? 0.2,
        system: input.system,
        messages: input.messages.filter((m) => m.role === "user" || m.role === "assistant"),
      }),
    });
    if (!res.ok) {
      const err = new Error((await res.text()).slice(0, 200));
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    // Mimo proxy may return OpenAI format despite /anthropic URL path
    if (!json.content && json.choices) {
      return json.choices?.[0]?.message?.content ?? "";
    }
    return (
      json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? ""
    );
  }

  const res = await fetch(openaiChatUrl(cfg.api_base_url), {
    method: "POST",
    headers: openaiHeaders(cfg.api_key),
    body: JSON.stringify({
      model: cfg.model_name,
      messages: [
        { role: "system", content: input.system },
        ...input.messages,
      ],
      max_tokens: input.max_tokens ?? 512,
      temperature: input.temperature ?? 0.2,
    }),
  });
  if (!res.ok) {
    const err = new Error((await res.text()).slice(0, 200));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export interface StreamChunk {
  type: "text_delta" | "done";
  text?: string;
}

export async function* streamPrompt(
  cfg: SlotConfig,
  prompt: AssembledPrompt,
): AsyncGenerator<StreamChunk> {
  const protocol = resolveProtocol(cfg);
  if (protocol === "anthropic") {
    yield* streamAnthropic(cfg, prompt);
    return;
  }
  yield* streamOpenAI(cfg, prompt);
}

async function* streamAnthropic(
  cfg: SlotConfig,
  prompt: AssembledPrompt,
): AsyncGenerator<StreamChunk> {
  const response = await fetch(anthropicMessagesUrl(cfg.api_base_url), {
    method: "POST",
    headers: anthropicHeaders(cfg.api_key),
    body: JSON.stringify({
      model: cfg.model_name,
      max_tokens: 4096,
      temperature: 0.7,
      system: prompt.system,
      stream: true,
      messages: prompt.messages.filter(
        (m) => m.role === "user" || m.role === "assistant",
      ),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(
      `模型调用失败（${response.status}）：${errText.slice(0, 200)}`,
    );
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  if (!response.body) throw new Error("模型未返回流式响应。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let eventType = "";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine || dataLine === "[DONE]") continue;

      try {
        const json = JSON.parse(dataLine) as {
          type?: string;
          delta?: { type?: string; text?: string };
          choices?: Array<{ delta?: { content?: string } }>;
        };

        // Mimo proxy may return OpenAI streaming format despite /anthropic URL path
        if (json.choices && json.choices.length > 0) {
          const delta = json.choices[0].delta?.content;
          if (delta) yield { type: "text_delta", text: delta };
          continue;
        }

        if (
          json.type === "content_block_delta" &&
          json.delta?.type === "text_delta" &&
          json.delta.text
        ) {
          yield { type: "text_delta", text: json.delta.text };
        }
        if (eventType === "message_stop" || json.type === "message_stop") {
          yield { type: "done" };
          return;
        }
      } catch {
        // skip
      }
    }
  }

  yield { type: "done" };
}

async function* streamOpenAI(
  cfg: SlotConfig,
  prompt: AssembledPrompt,
): AsyncGenerator<StreamChunk> {
  const response = await fetch(openaiChatUrl(cfg.api_base_url), {
    method: "POST",
    headers: openaiHeaders(cfg.api_key),
    body: JSON.stringify({
      model: cfg.model_name,
      messages: [
        { role: "system", content: prompt.system },
        ...prompt.messages,
      ],
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(
      `模型调用失败（${response.status}）：${errText.slice(0, 200)}`,
    );
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  if (!response.body) throw new Error("模型未返回流式响应。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        yield { type: "done" };
        return;
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield { type: "text_delta", text: delta };
      } catch {
        // skip
      }
    }
  }

  yield { type: "done" };
}
