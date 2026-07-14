import { getSupabase } from "@/lib/supabase/server";
import { fundLookupAsync } from "./lookup";
import { getFundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";

/**
 * Detect garbled / mojibake fund names.
 * A valid Chinese fund name should contain at least a few CJK characters
 * (U+4E00–U+9FFF). Names that are all question-marks, mostly non-CJK, or
 * contain replacement characters (U+FFFD) are considered corrupted.
 */
function isLikelyGarbled(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (name.includes("\uFFFD")) return true;
  const cjkCount = (name.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  return cjkCount < 2;
}

export interface WatchlistItem {
  id: string;
  fund_code: string;
  fund_name: string;
  added_at: string;
  last_analysis_at: string | null;
}

function mapRow(row: Record<string, unknown>): WatchlistItem {
  return {
    id: String(row.id),
    fund_code: String(row.fund_code),
    fund_name: String(row.fund_name),
    added_at: String(row.added_at),
    last_analysis_at: row.last_analysis_at ? String(row.last_analysis_at) : null,
  };
}

/**
 * List all active (non-deleted) funds from Supabase.
 */
export async function listWatchlist(): Promise<WatchlistItem[]> {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  const { data, error } = await supabase
    .from("fund_watchlist")
    .select("id, fund_code, fund_name, added_at, last_analysis_at")
    .is("deleted_at", null)
    .order("added_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * Add a fund to the watchlist.
 */
export async function addToWatchlist(fundCode: string): Promise<{
  ok: boolean;
  item?: WatchlistItem;
  error?: string;
  status?: number;
}> {
  const code = fundCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "基金代码须为 6 位数字。", status: 400 };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  // Check if already exists (active or deleted)
  const { data: existing } = await supabase
    .from("fund_watchlist")
    .select("id, deleted_at")
    .eq("fund_code", code)
    .single();

  if (existing && !existing.deleted_at) {
    return { ok: false, error: "已在您的自选列表中。", status: 409 };
  }

  // If previously soft-deleted, reactivate
  if (existing && existing.deleted_at) {
    const lookup = await fundLookupAsync({ fund_code: code });
    let fundName = lookup.ok ? lookup.fund_name! : code;

    if (isLikelyGarbled(fundName)) {
      const registry = getFundL0Profile(code);
      if (registry?.fund_name && !isLikelyGarbled(registry.fund_name)) {
        fundName = registry.fund_name;
      } else {
        fundName = code;
      }
    }

    const { data, error } = await supabase
      .from("fund_watchlist")
      .update({ deleted_at: null, fund_name: fundName, added_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id, fund_code, fund_name, added_at, last_analysis_at")
      .single();

    if (error) return { ok: false, error: error.message, status: 500 };
    return { ok: true, item: mapRow(data as Record<string, unknown>) };
  }

  // New fund — look up name
  const lookup = await fundLookupAsync({ fund_code: code });
  let fundName = lookup.ok ? lookup.fund_name! : code;

  if (isLikelyGarbled(fundName)) {
    const registry = getFundL0Profile(code);
    if (registry?.fund_name && !isLikelyGarbled(registry.fund_name)) {
      fundName = registry.fund_name;
    } else {
      fundName = code;
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("fund_watchlist")
    .insert({ fund_code: code, fund_name: fundName, added_at: now })
    .select("id, fund_code, fund_name, added_at, last_analysis_at")
    .single();

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, item: mapRow(data as Record<string, unknown>) };
}

/**
 * Soft-delete a fund from the watchlist.
 */
export async function removeFromWatchlist(fundCode: string): Promise<{
  ok: boolean;
  error?: string;
  status?: number;
}> {
  const code = fundCode.trim();
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, error: "Supabase not configured", status: 500 };
  }

  // Check existence (active only, not already deleted)
  const { data: existing } = await supabase
    .from("fund_watchlist")
    .select("id")
    .eq("fund_code", code)
    .is("deleted_at", null)
    .single();

  if (!existing) return { ok: false, error: "未找到该基金。", status: 404 };

  const { error } = await supabase
    .from("fund_watchlist")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", existing.id);

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}

/**
 * Search funds by code or name.
 */
export async function searchFunds(query: string): Promise<
  Array<{ fund_code: string; fund_name: string; fund_type?: string }>
> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { FUND_L0_REGISTRY } = await import("./lookup");
  const matches = Object.values(FUND_L0_REGISTRY)
    .filter(
      (f) =>
        f.fund_code.includes(q) ||
        f.fund_name.toLowerCase().includes(q) ||
        (q.length === 6 && f.fund_code === q),
    )
    .slice(0, 10)
    .map((f) => ({
      fund_code: f.fund_code,
      fund_name: f.fund_name,
      fund_type: f.fund_type,
    }));

  if (matches.length) return matches;

  if (/^\d{6}$/.test(q)) {
    const lookup = await fundLookupAsync({ fund_code: q });
    if (lookup.ok) {
      return [
        {
          fund_code: lookup.fund_code!,
          fund_name: lookup.fund_name!,
          fund_type: lookup.fund_type,
        },
      ];
    }
  }

  return [];
}
