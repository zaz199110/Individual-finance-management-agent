import { fundLookupAsync } from "@/lib/fund/lookup";

export async function runFundLookup(
  input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const result = await fundLookupAsync({
    fund_code:
      typeof input.fund_code === "string" ? input.fund_code : undefined,
    query: typeof input.query === "string" ? input.query : String(input.q ?? ""),
  });
  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }
  const preview = [
    `${result.fund_code} · ${result.fund_name}`,
    `类型：${result.fund_type}`,
    `风险：${result.risk_level ?? "—"}`,
    result.as_of_trade_date && result.nav != null
      ? `净值 ${result.nav}（截止 ${result.as_of_trade_date}）`
      : null,
    result.lookup_source ? `L0 来源：${result.lookup_source}` : null,
    result.l0_degraded ? "（部分行情为演示/降级数据）" : null,
    result.summary ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return { ok: true, preview, data: result };
}
