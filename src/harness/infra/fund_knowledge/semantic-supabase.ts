import { embedTextForPgvector } from "@/lib/embedding/embed-text";
import {
  L2_EMB_THRESHOLD,
  L2_KEYWORD_THRESHOLD,
  L2_TOP_K,
} from "@/lib/kb/kb-valid";
import { getSupabase } from "@/lib/supabase/server";
import type { SemanticHit } from "./semantic";

export interface SupabaseSemanticRow {
  id: string;
  fund_code: string | null;
  entry_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

export async function semanticSearchFromSupabase(input: {
  fund_code: string;
  query: string;
  max_hits?: number;
}): Promise<{
  ok: boolean;
  hits: SemanticHit[];
  low_confidence: boolean;
  used_pgvector: boolean;
  error?: string;
}> {
  const supabase = await getSupabase();
  if (!supabase) {
    return {
      ok: false,
      hits: [],
      low_confidence: true,
      used_pgvector: false,
      error: "数据库未连接。",
    };
  }

  const query = input.query.trim();
  if (!query) {
    return {
      ok: false,
      hits: [],
      low_confidence: true,
      used_pgvector: false,
      error: "query 为空。",
    };
  }

  const embedding = await embedTextForPgvector(query);
  const { data, error } = await supabase.rpc("match_fund_semantic_entries", {
    query_embedding: embedding,
    match_fund_code: input.fund_code,
    match_count: input.max_hits ?? L2_TOP_K * 2,
  });

  if (error) {
    return {
      ok: false,
      hits: [],
      low_confidence: true,
      used_pgvector: false,
      error: error.message,
    };
  }

  const rows = (data ?? []) as SupabaseSemanticRow[];
  const hits: SemanticHit[] = rows.map((r) => ({
    entry_type: r.entry_type,
    title: r.title,
    body: r.body,
    metadata: (r.metadata ?? undefined) as SemanticHit["metadata"],
    score: r.similarity,
    embed_score: r.similarity,
  }));

  const topScore = hits[0]?.embed_score ?? 0;
  const low_confidence =
    hits.length === 0 ||
    topScore < L2_EMB_THRESHOLD ||
    (topScore < L2_KEYWORD_THRESHOLD && topScore < 0.55);

  return {
    ok: true,
    hits: hits.slice(0, input.max_hits ?? L2_TOP_K),
    low_confidence,
    used_pgvector: true,
  };
}
