export const ZHIPU_EMBEDDING_API_BASE = "https://open.bigmodel.cn/api/paas/v4";
export const DEFAULT_EMBEDDING_MODEL = "embedding-3";

export interface ZhipuEmbeddingOptions {
  apiKey: string;
  input: string;
  baseUrl?: string;
  model?: string;
  dimensions?: number;
}

interface ZhipuEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { code?: string; message?: string };
}

export function zhipuEmbeddingsUrl(baseUrl = ZHIPU_EMBEDDING_API_BASE): string {
  return `${baseUrl.replace(/\/$/, "")}/embeddings`;
}

/** 智谱 GLM Embedding-3 — 文本向量化 */
export async function zhipuEmbed(
  options: ZhipuEmbeddingOptions,
): Promise<number[]> {
  const input = options.input.trim();
  if (!input) {
    throw new Error("请提供待嵌入文本。");
  }

  const url = zhipuEmbeddingsUrl(options.baseUrl);
  const body: Record<string, unknown> = {
    model: options.model ?? DEFAULT_EMBEDDING_MODEL,
    input,
  };
  if (options.dimensions) {
    body.dimensions = options.dimensions;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`文本嵌入失败（${response.status}）：${text.slice(0, 200)}`);
  }

  let json: ZhipuEmbeddingResponse;
  try {
    json = JSON.parse(text) as ZhipuEmbeddingResponse;
  } catch {
    throw new Error(`文本嵌入响应解析失败：${text.slice(0, 120)}`);
  }

  if (json.error?.message) {
    throw new Error(`文本嵌入错误：${json.error.message}`);
  }

  const vector = json.data?.[0]?.embedding;
  if (!vector?.length) {
    throw new Error("文本嵌入未返回向量。");
  }
  return vector;
}

export async function probeZhipuEmbedding(cfg: {
  api_key: string;
  api_base_url?: string;
  model_name?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const vector = await zhipuEmbed({
      apiKey: cfg.api_key,
      baseUrl: cfg.api_base_url,
      model: cfg.model_name ?? DEFAULT_EMBEDDING_MODEL,
      input: "你好，今天天气怎么样。",
      dimensions: 256,
    });
    if (vector.length > 0) {
      return { ok: true, message: "智谱 Embedding-3 检测通过。" };
    }
    return { ok: false, message: "嵌入向量为空。" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "网络错误",
    };
  }
}
