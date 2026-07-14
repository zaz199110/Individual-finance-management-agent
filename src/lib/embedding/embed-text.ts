import { createHash } from "node:crypto";
import { resolveProviderStack } from "@/lib/config/model-providers";
import { zhipuEmbed } from "@/lib/zhipu/embedding";

export const PGVECTOR_DIM = 1536;

/** 离线 seed / 无 API 时与 apply_semantic.py 一致的确定性伪向量 */
export function mockEmbedding1536(text: string): number[] {
  const tokens = text.match(/[\u4e00-\u9fff]{1,4}|[a-zA-Z0-9]{2,}/gi) ?? [];
  const vec = new Array<number>(PGVECTOR_DIM).fill(0);
  if (!tokens.length) return vec;
  for (const token of tokens) {
    const digest = createHash("sha256").update(token.toLowerCase()).digest();
    for (let i = 0; i < digest.length; i++) {
      vec[i % PGVECTOR_DIM]! += (digest[i]! / 255 - 0.5) * 0.1;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/** 查询向量：优先智谱 embedding，失败回退 mock（与 seed 维度一致） */
export async function embedTextForPgvector(text: string): Promise<number[]> {
  const cfg = resolveProviderStack().embedding;
  if (cfg?.api_key) {
    try {
      const vector = await zhipuEmbed({
        apiKey: cfg.api_key,
        baseUrl: cfg.api_base_url,
        model: cfg.model_name,
        input: text,
      });
      if (vector.length === PGVECTOR_DIM) return vector;
      if (vector.length > PGVECTOR_DIM) return vector.slice(0, PGVECTOR_DIM);
      const padded = [...vector];
      while (padded.length < PGVECTOR_DIM) padded.push(0);
      return padded;
    } catch {
      /* fall through */
    }
  }
  return mockEmbedding1536(text);
}

export function vectorToPgLiteral(values: number[]): string {
  return `[${values.map((v) => v.toFixed(8)).join(",")}]`;
}
