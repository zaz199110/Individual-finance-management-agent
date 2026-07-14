import { screenFundsForCategory } from "@/lib/plan/screen-funds";

export async function runPlanScreenFunds(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const category = String(input.category ?? "");
  if (!["股票类", "债券类", "货币类"].includes(category)) {
    return { ok: false, preview: "", error: "category 须为 股票类/债券类/货币类。" };
  }

  const exclude = Array.isArray(input.exclude_codes)
    ? (input.exclude_codes as string[])
    : undefined;

  const candidates = await screenFundsForCategory({
    category: category as "股票类" | "债券类" | "货币类",
    exclude_codes: exclude,
    allow_qdii: input.allow_qdii !== false,
  });

  return {
    ok: true,
    preview: `${category} 初筛 ${candidates.length} 只（Top40）。`,
    data: { category, candidates, count: candidates.length },
  };
}
