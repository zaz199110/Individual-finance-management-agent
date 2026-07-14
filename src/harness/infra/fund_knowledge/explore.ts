import { ensureFundKnowledgeVault } from "./bootstrap";
import type { KnowledgeChunk } from "./chunk";
import { loadVaultChunks } from "./chunk";
import { getIndexDbPath, queryFts } from "./index-db";
import fs from "node:fs";
import { fundKnowledgeDeepLink } from "./paths";
import { resolveVaultDocPublishDateFromPath } from "./vault-doc-date";
import {
  L1_KEYWORD_THRESHOLD,
  L1_RECALL,
  L1_TOP_K,
} from "@/lib/kb/kb-valid";

export interface ExploreHit {
  chunk_id: string;
  fund_code: string;
  doc_type: string;
  file_path: string;
  heading: string;
  line_start: number;
  line_end: number;
  excerpt: string;
  score: number;
  embed_score?: number;
  deep_link: string;
  /** 来源报告发布日期 YYYY-MM-DD（vault 文档解析） */
  source_as_of?: string;
}

export interface ExploreResult {
  ok: boolean;
  fund_code: string;
  query: string;
  hits: ExploreHit[];
  low_confidence: boolean;
  used_embedding?: boolean;
  card_text: string;
  error?: string;
}

const DOC_TYPE_WEIGHT: Record<string, number> = {
  prospectus: 3,
  quarterly_report: 2,
  semiannual_report: 2,
  annual_report: 2,
  expert_opinion: 1,
  other: 0.5,
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s，。、；：？！,.;:!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreChunk(chunk: KnowledgeChunk, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = `${chunk.heading}\n${chunk.content}`.toLowerCase();
  let score = DOC_TYPE_WEIGHT[chunk.doc_type] ?? 0.5;
  for (const token of tokens) {
    if (hay.includes(token)) score += 2;
  }
  if (chunk.heading !== "frontmatter" && chunk.heading !== "正文") {
    score += 0.5;
  }
  return score;
}

function trimExcerpt(content: string, max = 1200): string {
  const t = content.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function buildCardText(hits: ExploreHit[], fundCode: string, query: string): string {
  if (!hits.length) {
    return `未在 ${fundCode} vault 中找到与「${query}」足够相关的披露块（LOW_CONFIDENCE）。`;
  }
  return hits
    .map(
      (h, i) =>
        `**[${i + 1}] ${h.heading}**（${h.doc_type} · ${h.chunk_id}）\n${h.excerpt}\n[查看原文](${h.deep_link})`,
    )
    .join("\n\n---\n\n");
}

function attachDocPublishDate(
  hit: Omit<ExploreHit, "source_as_of">,
  vaultRoot: string,
): ExploreHit {
  return {
    ...hit,
    source_as_of: resolveVaultDocPublishDateFromPath(vaultRoot, hit.file_path),
  };
}

function chunkToHit(
  chunk: KnowledgeChunk,
  score: number,
  vaultRoot: string,
): ExploreHit {
  return attachDocPublishDate(
    {
      chunk_id: chunk.chunk_id,
      fund_code: chunk.fund_code,
      doc_type: chunk.doc_type,
      file_path: chunk.file_path,
      heading: chunk.heading,
      line_start: chunk.line_start,
      line_end: chunk.line_end,
      excerpt: trimExcerpt(chunk.content),
      score,
      deep_link: fundKnowledgeDeepLink({
        fundCode: chunk.fund_code,
        filePath: chunk.file_path,
        line: chunk.line_start,
      }),
    },
    vaultRoot,
  );
}

function recallExploreHits(input: {
  fund_code: string;
  query: string;
  recall_limit: number;
}): { hits: ExploreHit[]; empty_vault: boolean } {
  const fundCode = input.fund_code;
  const query = input.query;
  const vaultRoot = ensureFundKnowledgeVault();

  const ftsHits = fs.existsSync(getIndexDbPath(vaultRoot))
    ? queryFts({
        vaultRoot,
        fund_code: fundCode,
        query,
        limit: input.recall_limit,
      })
    : [];

  if (ftsHits.length) {
    return {
      hits: ftsHits.map((h) =>
        attachDocPublishDate(
          {
            chunk_id: h.chunk_id,
            fund_code: h.fund_code,
            doc_type: h.doc_type,
            file_path: h.file_path,
            heading: h.heading,
            line_start: h.line_start,
            line_end: h.line_end,
            excerpt: trimExcerpt(h.content),
            score: Math.abs(h.rank) + (DOC_TYPE_WEIGHT[h.doc_type] ?? 0.5),
            deep_link: fundKnowledgeDeepLink({
              fundCode: h.fund_code,
              filePath: h.file_path,
              line: h.line_start,
            }),
          },
          vaultRoot,
        ),
      ),
      empty_vault: false,
    };
  }

  const chunks = loadVaultChunks(vaultRoot, fundCode);
  if (!chunks.length) {
    return { hits: [], empty_vault: true };
  }

  const tokens = tokenize(query);
  const hits = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.recall_limit)
    .map(({ chunk, score }) => chunkToHit(chunk, score, vaultRoot));

  return { hits, empty_vault: false };
}

function validateExploreInput(
  fundCode: string,
  query: string,
): ExploreResult | null {
  if (!/^\d{6}$/.test(fundCode)) {
    return {
      ok: false,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      card_text: "",
      error: "fund_code 须为 6 位数字。",
    };
  }
  if (!query) {
    return {
      ok: false,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      card_text: "",
      error: "请提供 explore 检索 query。",
    };
  }
  return null;
}

/** Sync · keyword/FTS only（测试 / 无 embedding 降级） */
export function exploreFundKnowledge(input: {
  fund_code: string;
  query: string;
  max_hits?: number;
}): ExploreResult {
  const fundCode = String(input.fund_code ?? "").trim();
  const query = String(input.query ?? "").trim();
  const invalid = validateExploreInput(fundCode, query);
  if (invalid) return invalid;

  const { hits, empty_vault } = recallExploreHits({
    fund_code: fundCode,
    query,
    recall_limit: input.max_hits ?? 5,
  });

  if (empty_vault) {
    return {
      ok: true,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      card_text: `基金 ${fundCode} 暂无 vault 披露材料（C 档或无库）。`,
    };
  }

  const topK = hits.slice(0, input.max_hits ?? 5);
  const lowConfidence =
    topK.length === 0 || (topK[0]?.score ?? 0) < L1_KEYWORD_THRESHOLD;

  return {
    ok: true,
    fund_code: fundCode,
    query,
    hits: topK,
    low_confidence: lowConfidence,
    card_text: buildCardText(topK, fundCode, query),
  };
}

/** Async · L1 不做 embedding 筛选，直接提供最相关的 block */
export async function exploreFundKnowledgeAsync(input: {
  fund_code: string;
  query: string;
  max_hits?: number;
}): Promise<ExploreResult> {
  const fundCode = String(input.fund_code ?? "").trim();
  const query = String(input.query ?? "").trim();
  const invalid = validateExploreInput(fundCode, query);
  if (invalid) return invalid;

  const topK = input.max_hits ?? L1_TOP_K;
  const { hits: recalled, empty_vault } = recallExploreHits({
    fund_code: fundCode,
    query,
    recall_limit: L1_RECALL,
  });

  if (empty_vault) {
    return {
      ok: true,
      fund_code: fundCode,
      query,
      hits: [],
      low_confidence: true,
      card_text: `基金 ${fundCode} 暂无 vault 披露材料（C 档或无库）。`,
    };
  }

  // L1 不做 embedding 筛选，直接按关键词分数排序取 topK
  const topHits = recalled.slice(0, topK);
  const lowConfidence =
    topHits.length === 0 || (topHits[0]?.score ?? 0) < L1_KEYWORD_THRESHOLD;

  return {
    ok: true,
    fund_code: fundCode,
    query,
    hits: topHits,
    low_confidence: lowConfidence,
    used_embedding: false,
    card_text: buildCardText(topHits, fundCode, query),
  };
}
