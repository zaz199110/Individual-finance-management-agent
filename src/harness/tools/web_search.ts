import { resolveProviderStack } from "@/lib/config/model-providers";
import { L3_RECALL } from "@/lib/kb/kb-valid";
import { zhipuWebSearch, probeZhipuWebSearch } from "@/lib/zhipu/web-search";
import type { SlotConfig } from "@/lib/config/model-providers";
import type {
  WebSearchCitation,
  WebSearchInput,
  WebSearchResult,
} from "./web_search.types";

const MAX_CITATIONS = 5;

function isZhipuSearchEngine(modelName: string): boolean {
  return /^search_/i.test(modelName);
}

async function resolveWebSearchConfig(): Promise<SlotConfig | null> {
  return resolveProviderStack().web;
}

interface WebCitationCandidate extends WebSearchCitation {
  summary_snippet: string;
  keyword_score: number;
}

/** 联网搜索 — 默认智谱 Search-Std；使用关键词排序，不做 embedding 重排（embedding rerank 仅限 L2 语义搜索） */
export async function webSearch(input: WebSearchInput): Promise<WebSearchResult> {
  const query = input.query?.trim();
  if (!query) {
    return { summary: "请提供检索关键词。", citations: [] };
  }

  const cfg = await resolveWebSearchConfig();
  if (!cfg?.api_key) {
    throw new Error(
      "联网搜索未配置，请设置 ZHIPU_API_KEY 与 ZHIPU_WEB_SEARCH_ENGINE=search_std。",
    );
  }

    const maxResults = input.max_results ?? MAX_CITATIONS;
    const fetchCount = Math.min(Math.max(maxResults, L3_RECALL), 50);

    if (cfg.provider === "zhipu" || isZhipuSearchEngine(cfg.model_name)) {
      const raw = await zhipuWebSearch({
        apiKey: cfg.api_key,
        baseUrl: cfg.api_base_url,
        query,
        searchEngine: cfg.model_name,
        count: fetchCount,
        recencyFilter: input.recency_filter,
      });

    let parsed: Array<{ title: string; url: string; snippet: string }> = [];
    try {
      const json = JSON.parse(raw.raw ?? "{}") as {
        search_result?: Array<{ title?: string; link?: string; content?: string }>;
      };
      parsed = (json.search_result ?? [])
        .filter((item) => item.link)
        .map((item, i) => ({
          title:
            item.title ||
            item.link!.replace(/^https?:\/\//, "").slice(0, 60) ||
            `来源 ${i + 1}`,
          url: item.link!,
          snippet: item.content?.trim() ?? "",
        }));
    } catch {
      parsed = raw.citations.map((c, i) => ({
        title: c.title,
        url: c.url,
        snippet: "",
      }));
    }

    const candidates: WebCitationCandidate[] = parsed.map((item, i) => ({
      title: item.title,
      url: item.url,
      summary_snippet: item.snippet,
      keyword_score: Math.max(1, fetchCount - i),
    }));

    // 3️⃣ Select top citations (embedding rerank is L2-only; L3 web search uses keyword ranking)
    const citations = candidates.slice(0, maxResults).map(({ title, url }) => ({
      title,
      url,
    }));
    const low_confidence = candidates.length === 0;
    const used_embedding = false;

    const summaryParts = citations.map((c, i) => {
      const match = candidates.find((x) => x.url === c.url);
      const body = match?.summary_snippet?.trim();
      return body ? `**${c.title}**：${body}` : `**${c.title}**`;
    });

    const summary =
      summaryParts.length > 0
        ? summaryParts.join("\n\n")
        : low_confidence
          ? "未找到相关公开信息（LOW_CONFIDENCE）。"
          : "未找到相关公开信息。";

    return {
      summary,
      citations,
      snippets: parsed.map((item) => item.snippet).filter((s) => s.length > 0),
      raw: raw.raw,
      l3_low_confidence: low_confidence,
      used_embedding,
    };
  }

  throw new Error(
    `联网槽位需配置智谱 Search-Std（当前 provider=${cfg.provider}）。`,
  );
}

export { probeZhipuWebSearch };
