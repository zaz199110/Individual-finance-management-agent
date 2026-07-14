import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoldingsReadResult, HoldingsPosition } from "./types";

export async function holdingsRead(
  supabase: SupabaseClient | null,
): Promise<HoldingsReadResult> {
  if (!supabase) {
    return emptyRead("数据库未连接。");
  }

  const { data } = await supabase
    .from("holdings_versions")
    .select("id, positions, confirmed_at")
    .eq("is_current", true)
    .maybeSingle();

  if (!data) {
    return emptyRead("当前无持仓快照。");
  }

  const positions = (data.positions ?? []) as HoldingsPosition[];
  const totalCost = positions.reduce(
    (sum, p) => sum + (Number(p.paid_amount) || 0),
    0,
  );

  const positionsSummary = positions
    .map(
      (p) =>
        `${p.fund_name ?? p.fund_code} ${p.paid_amount.toLocaleString("zh-CN")}元`,
    )
    .join(" · ");

  const dateLabel = data.confirmed_at
    ? new Date(data.confirmed_at as string).toLocaleDateString("zh-CN")
    : "—";

  const lines = [
    `当前持仓：${positions.length} 笔 · 总成本约 ${totalCost.toLocaleString("zh-CN")} 元`,
    `上次确认：${dateLabel}`,
    positions.length ? `明细：${positionsSummary}` : "",
  ].filter(Boolean);

  return {
    has_current: positions.length > 0,
    holdings_version_id: data.id as string,
    position_count: positions.length,
    confirmed_at: (data.confirmed_at as string | null) ?? null,
    total_cost: totalCost,
    positions_summary: positionsSummary,
    summary: lines.join("\n"),
    positions: positions.length > 0 ? positions : undefined,
  };
}

function emptyRead(note: string): HoldingsReadResult {
  return {
    has_current: false,
    holdings_version_id: null,
    position_count: 0,
    confirmed_at: null,
    total_cost: 0,
    positions_summary: "",
    summary: note,
    positions: undefined,
  };
}

/** @deprecated use holdingsRead — kept for placeholder API */
export async function portfolioRead(supabase: SupabaseClient | null) {
  const read = await holdingsRead(supabase);
  return {
    has_current: read.has_current,
    position_count: read.position_count,
    confirmed_at: read.confirmed_at,
    total_cost: read.total_cost,
  };
}
