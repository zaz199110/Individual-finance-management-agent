import { resolveProviderStack } from "@/lib/config/model-providers";
import { zhipuEmbed } from "@/lib/zhipu/embedding";
import { isEmbeddingRerankEnabled } from "./settings";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export interface RerankResult<T> {
  items: Array<T & { embed_score?: number; score: number }>;
  used_embedding: boolean;
  low_confidence: boolean;
}

export async function rerankByEmbedding<T>(options: {
  query: string;
  items: T[];
  getText: (item: T) => string;
  getKeywordScore: (item: T) => number;
  topK: number;
  embedThreshold: number;
  keywordThreshold: number;
}): Promise<RerankResult<T>> {
  const keywordRanked = [...options.items]
    .map((item) => ({ item, kw: options.getKeywordScore(item) }))
    .filter((x) => x.kw > 0)
    .sort((a, b) => b.kw - a.kw);

  if (!keywordRanked.length) {
    return { items: [], used_embedding: false, low_confidence: true };
  }

  const enabled = await isEmbeddingRerankEnabled();
  if (!enabled) {
    const top = keywordRanked.slice(0, options.topK);
    const topScore = top[0]?.kw ?? 0;
    return {
      items: top.map(({ item, kw }) => ({ ...item, score: kw })),
      used_embedding: false,
      low_confidence: topScore < options.keywordThreshold,
    };
  }

  const cfg = resolveProviderStack().embedding;
  if (!cfg?.api_key) {
    const top = keywordRanked.slice(0, options.topK);
    const topScore = top[0]?.kw ?? 0;
    return {
      items: top.map(({ item, kw }) => ({ ...item, score: kw })),
      used_embedding: false,
      low_confidence: topScore < options.keywordThreshold,
    };
  }

  try {
    const queryVec = await zhipuEmbed({
      apiKey: cfg.api_key,
      baseUrl: cfg.api_base_url,
      model: cfg.model_name,
      input: options.query,
      dimensions: 256,
    });

    const candidates = keywordRanked.slice(0, Math.max(options.topK * 4, 12));
    const scored: Array<T & { embed_score: number; score: number }> = [];

    for (const { item, kw } of candidates) {
      const text = options.getText(item).trim().slice(0, 800);
      if (!text) continue;
      const vec = await zhipuEmbed({
        apiKey: cfg.api_key,
        baseUrl: cfg.api_base_url,
        model: cfg.model_name,
        input: text,
        dimensions: 256,
      });
      const embedScore = cosineSimilarity(queryVec, vec);
      scored.push({
        ...item,
        embed_score: embedScore,
        score: embedScore * 0.7 + (kw / 10) * 0.3,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, options.topK);
    const topEmbed = top[0]?.embed_score ?? 0;
    return {
      items: top,
      used_embedding: true,
      low_confidence: topEmbed < options.embedThreshold,
    };
  } catch {
    const top = keywordRanked.slice(0, options.topK);
    const topScore = top[0]?.kw ?? 0;
    return {
      items: top.map(({ item, kw }) => ({ ...item, score: kw })),
      used_embedding: false,
      low_confidence: topScore < options.keywordThreshold,
    };
  }
}
