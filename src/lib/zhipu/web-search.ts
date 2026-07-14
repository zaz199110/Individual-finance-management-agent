import type { WebSearchResult } from "@/harness/tools/web_search.types";

export const ZHIPU_WEB_API_BASE = "https://open.bigmodel.cn/api";
export const DEFAULT_SEARCH_ENGINE = "search_std";

export interface ZhipuWebSearchOptions {
  apiKey: string;
  query: string;
  baseUrl?: string;
  searchEngine?: string;
  count?: number;
  searchIntent?: boolean;
  /** 时间范围过滤 */
  recencyFilter?: "oneDay" | "oneWeek" | "oneMonth" | "oneYear" | "noLimit";
}

interface ZhipuWebSearchResponse {
  search_result?: Array<{
    title?: string;
    content?: string;
    link?: string;
    media?: string;
  }>;
  error?: { code?: string; message?: string };
}

export function zhipuWebSearchUrl(baseUrl = ZHIPU_WEB_API_BASE): string {
  return `${baseUrl.replace(/\/$/, "")}/paas/v4/web_search`;
}

/** 智谱 Web Search API — Search-Std / Search-Pro 等 */
export async function zhipuWebSearch(
  options: ZhipuWebSearchOptions,
): Promise<WebSearchResult> {
  const query = options.query.trim().slice(0, 70);
  if (!query) {
    return { summary: "请提供检索关键词。", citations: [] };
  }

  const url = zhipuWebSearchUrl(options.baseUrl);
  const count = Math.min(Math.max(options.count ?? 5, 1), 50);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      search_query: query,
      search_engine: options.searchEngine ?? DEFAULT_SEARCH_ENGINE,
      search_intent: options.searchIntent ?? false,
      count,
      content_size: "medium",
      ...(options.recencyFilter ? { search_recency_filter: options.recencyFilter } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`联网检索失败（${response.status}）：${text.slice(0, 200)}`);
  }

  let json: ZhipuWebSearchResponse;
  try {
    json = JSON.parse(text) as ZhipuWebSearchResponse;
  } catch {
    throw new Error(`联网检索响应解析失败：${text.slice(0, 120)}`);
  }

  if (json.error?.message) {
    throw new Error(`联网检索错误：${json.error.message}`);
  }

  const items = json.search_result ?? [];
  const citations = items
    .filter((item) => item.link)
    .slice(0, count)
    .map((item) => ({
      title: item.title || item.media || item.link!.replace(/^https?:\/\//, "").slice(0, 60),
      url: item.link!,
    }));

  const summaryParts = items.slice(0, count).map((item, i) => {
    const title = item.title ?? `来源 ${i + 1}`;
    const body = item.content?.trim() ?? "";
    return body ? `**${title}**：${body}` : `**${title}**`;
  });

  const summary =
    summaryParts.length > 0
      ? summaryParts.join("\n\n")
      : "未找到相关公开信息。";

  return {
    summary,
    citations,
    raw: text,
  };
}

export async function probeZhipuWebSearch(cfg: {
  api_key: string;
  api_base_url?: string;
  model_name?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await zhipuWebSearch({
      apiKey: cfg.api_key,
      baseUrl: cfg.api_base_url,
      query: "A股",
      searchEngine: cfg.model_name,
      count: 1,
    });
    if (result.citations.length > 0 || result.summary.length > 0) {
      return { ok: true, message: "智谱 Search-Std 检测通过。" };
    }
    return { ok: false, message: "检索无结果。" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "网络错误",
    };
  }
}
