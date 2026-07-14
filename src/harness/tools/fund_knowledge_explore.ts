import { exploreFundKnowledgeAsync } from "@/harness/infra/fund_knowledge/explore";

export async function runFundKnowledgeExplore(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const result = await exploreFundKnowledgeAsync({
    fund_code: String(input.fund_code ?? ""),
    query: String(input.query ?? input.q ?? ""),
    max_hits: Number(input.max_hits ?? 5),
  });
  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }
  return {
    ok: true,
    preview: result.card_text.slice(0, 2000),
    data: result,
  };
}
