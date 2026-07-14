import fs from "node:fs";
import { rerankByEmbedding } from "@/lib/embedding/rerank";
import {
  L2_EMB_THRESHOLD,
  L2_KEYWORD_THRESHOLD,
  L2_RECALL,
  L2_TOP_K,
  L2_TOP_K_WITH_EMB,
  L2_TOP_K_WITHOUT_EMB,
} from "@/lib/kb/kb-valid";
import { semanticSearchFromSupabase } from "./semantic-supabase";
import { getFundSemanticSeedPath } from "./paths";

export interface SemanticEntry {
  entry_type: string;
  title: string;
  body: string;
  metadata?: { keywords?: string[]; suggested_doc_types?: string[] };
}

export type SemanticHit = SemanticEntry & {
  score: number;
  embed_score?: number;
};

export interface SemanticSearchResult {
  ok: boolean;
  fund_code: string;
  query: string;
  hits: SemanticHit[];
  low_confidence: boolean;
  used_embedding?: boolean;
  preview: string;
  top_metadata?: SemanticEntry["metadata"];
  error?: string;
}

let cachedEntries: (SemanticEntry & { fund_code?: string })[] | null = null;

function loadSeedEntries(_fundCode?: string): SemanticEntry[] {
  if (!cachedEntries) {
    const p = getFundSemanticSeedPath();
    if (!fs.existsSync(p)) {
      cachedEntries = [];
    } else {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
        fund_code?: string;
        entries?: (SemanticEntry & { fund_code?: string })[];
      };
      cachedEntries = (raw.entries ?? []).map((e) => ({
        ...e,
        fund_code: e.fund_code ?? raw.fund_code,
      }));
    }
  }
  /** L2-SEED-02：仅通用 FAQ（fund_code=* 或缺省），不按单基金过滤 */
  return (cachedEntries ?? []).filter(
    (e) => !e.fund_code || e.fund_code === "*" || e.fund_code === "GLOBAL",
  );
}

/**
 * Tokenize CJK text that lacks word delimiters.
 * For text with spaces/punctuation, split normally.
 * For single-segment Chinese text (no whitespace), generate character bigrams + trigrams.
 */
function tokenizeCJK(text: string): string[] {
  const spaceTokens = text.split(/[\s，。、？！]+/).filter((t) => t.length >= 2);
  if (spaceTokens.length > 1 || (spaceTokens.length === 1 && spaceTokens[0] !== text)) {
    return spaceTokens;
  }
  // Chinese text without word boundaries: generate n-grams
  const result: string[] = [];
  if (text.length < 2) return result;
  for (let i = 0; i < text.length - 1; i++) result.push(text.slice(i, i + 2));
  for (let i = 0; i < text.length - 2; i++) result.push(text.slice(i, i + 3));
  return [...new Set(result)];
}

function scoreEntry(entry: SemanticEntry, query: string): number {
  const q = query.toLowerCase();
  const title = entry.title.toLowerCase();
  const body = entry.body.toLowerCase();
  let score = 0;
  if (title.includes(q)) score += 5;
  for (const kw of entry.metadata?.keywords ?? []) {
    const kwLower = kw.toLowerCase();
    if (q.includes(kwLower) || kwLower.includes(q)) score += 3;
  }
  for (const token of tokenizeCJK(q)) {
    if (title.includes(token)) score += 2;
    if (body.includes(token)) score += 1;
  }
  return score;
}

function buildPreview(hits: SemanticHit[], query: string): string {
  if (!hits.length) {
    return `暂未找到与「${query}」高度相关的常见问题解答，请结合招募说明书与公开披露综合判断。`;
  }
  return hits.map((h) => `**${h.title}**\n${h.body}`).join("\n\n");
}

function recallSemanticEntries(
  query: string,
  recallLimit: number,
  fundCode?: string,
): SemanticHit[] {
  return loadSeedEntries(fundCode)
    .map((e) => ({ ...e, score: scoreEntry(e, query) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, recallLimit);
}

export function semanticSearchFundKnowledge(input: {
  fund_code?: string;
  query: string;
  max_hits?: number;
}): SemanticSearchResult {
  const fundCode = String(input.fund_code ?? "019305").trim();
  const query = String(input.query ?? "").trim();
  if (!query) {
    return {
      ok: false,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      preview: "",
      error: "请提供 semantic 检索 query。",
    };
  }

  const ranked = recallSemanticEntries(query, input.max_hits ?? L2_TOP_K, fundCode);
  const lowConfidence =
    ranked.length === 0 || (ranked[0]?.score ?? 0) < L2_KEYWORD_THRESHOLD;

  return {
    ok: true,
    fund_code: fundCode,
    query,
    hits: ranked,
    low_confidence: lowConfidence,
    preview: buildPreview(ranked, query),
    top_metadata: ranked[0]?.metadata,
  };
}

export async function semanticSearchFundKnowledgeAsync(input: {
  fund_code?: string;
  query: string;
  max_hits?: number;
}): Promise<SemanticSearchResult> {
  const fundCode = String(input.fund_code ?? "019305").trim();
  const query = String(input.query ?? "").trim();
  if (!query) {
    return {
      ok: false,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      preview: "",
      error: "请提供 semantic 检索 query。",
    };
  }

  const topK = input.max_hits ?? L2_TOP_K;

  // 尝试 pgvector 语义搜索
  const pg = await semanticSearchFromSupabase({
    fund_code: fundCode,
    query,
    max_hits: topK,
  });
  if (pg.ok && pg.hits.length > 0) {
    // 有 embedding 时，动态调整 TOP_K
    const embTopK = input.max_hits ?? L2_TOP_K_WITH_EMB;
    return {
      ok: true,
      fund_code: fundCode,
      query,
      hits: pg.hits.slice(0, embTopK),
      low_confidence: pg.low_confidence,
      used_embedding: true,
      preview: buildPreview(pg.hits.slice(0, embTopK), query),
      top_metadata: pg.hits[0]?.metadata,
    };
  }

  // 降级到关键词搜索
  const recalled = recallSemanticEntries(query, L2_RECALL, fundCode);

  // 无 embedding 时，提供更多的结果
  const noEmbTopK = input.max_hits ?? L2_TOP_K_WITHOUT_EMB;
  const reranked = await rerankByEmbedding({
    query,
    items: recalled,
    getText: (e) => `${e.title}\n${e.body}`,
    getKeywordScore: (e) => e.score,
    topK: noEmbTopK,
    embedThreshold: L2_EMB_THRESHOLD,
    keywordThreshold: L2_KEYWORD_THRESHOLD,
  });

  // P3: log keyword-vs-embedding top-1 divergence for monitoring
  if (reranked.used_embedding && recalled.length > 0 && reranked.items.length > 0) {
    const kwTop1 = recalled[0];
    const embTop1 = reranked.items[0];
    if (kwTop1.title !== embTop1.title) {
      console.warn(
        `[L2-DIVERGE] query="${query}" kw_top1="${kwTop1.title}" emb_top1="${embTop1.title}"`,
      );
    }
  }

  return {
    ok: true,
    fund_code: fundCode,
    query,
    hits: reranked.items,
    low_confidence: reranked.low_confidence,
    used_embedding: reranked.used_embedding,
    preview: buildPreview(reranked.items, query),
    top_metadata: reranked.items[0]?.metadata,
  };
}
