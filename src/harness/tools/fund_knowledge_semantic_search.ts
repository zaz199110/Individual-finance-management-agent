import { semanticSearchFundKnowledgeAsync } from "@/harness/infra/fund_knowledge/semantic";

export async function runFundKnowledgeSemanticSearch(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const result = await semanticSearchFundKnowledgeAsync({
    fund_code: input.fund_code ? String(input.fund_code) : undefined,
    query: String(input.query ?? input.q ?? ""),
    max_hits: Number(input.max_hits ?? 3),
  });
  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }
  return {
    ok: true,
    preview: result.preview.slice(0, 2000),
    data: result,
  };
}
