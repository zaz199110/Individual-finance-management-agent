import { tushareQuery } from "@/lib/l0/tushare-client";
import { resolveTushareToken } from "@/lib/settings/datasources";
import { getSupabase } from "@/lib/supabase/server";

function isoFromYyyymmdd(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchCalendarFromTushare(
  year: number,
  token: string,
): Promise<Array<{ cal_date: string; is_open: boolean }>> {
  const start = `${year}0101`;
  const end = `${year}1231`;
  const rows = await tushareQuery({
    token,
    apiName: "trade_cal",
    params: { exchange: "SSE", start_date: start, end_date: end },
    fields: "cal_date,is_open",
  });
  return rows
    .filter((r) => r.cal_date)
    .map((r) => ({
      cal_date: isoFromYyyymmdd(String(r.cal_date)),
      is_open: String(r.is_open) === "1" || r.is_open === 1 || r.is_open === true,
    }));
}

export async function countTradingCalendarYear(year: number): Promise<number> {
  const supabase = await getSupabase();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("trading_calendar")
    .select("*", { count: "exact", head: true })
    .eq("year", year);
  return count ?? 0;
}

export async function ensureTradingCalendarYears(
  years: number[],
): Promise<{ ok: boolean; source?: string; error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const token = await resolveTushareToken();
  if (!token) {
    return { ok: false, error: "未配置 Tushare Token，无法拉取交易日历。" };
  }

  const now = new Date().toISOString();
  for (const year of years) {
    const existing = await countTradingCalendarYear(year);
    if (existing >= 300) continue;

    try {
      const rows = await fetchCalendarFromTushare(year, token);
      if (!rows.length) continue;

      const payload = rows.map((r) => ({
        cal_date: r.cal_date,
        exchange: "SSE",
        is_open: r.is_open,
        year,
        source: "tushare",
        fetched_at: now,
      }));

      const chunkSize = 200;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from("trading_calendar").upsert(chunk, {
          onConflict: "cal_date,exchange",
        });
        if (error) return { ok: false, error: error.message };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "拉取交易日历失败";
      return { ok: false, error: msg };
    }
  }

  return { ok: true, source: "tushare" };
}

/** 锚点日（Asia/Shanghai）及之前最近一个开市日 */
export async function resolveAsOfTradeDate(anchorShanghai: string): Promise<string> {
  const supabase = await getSupabase();
  if (supabase) {
    const year = Number(anchorShanghai.slice(0, 4));
    if ((await countTradingCalendarYear(year)) < 50) {
      await ensureTradingCalendarYears([year]);
    }

    const { data } = await supabase
      .from("trading_calendar")
      .select("cal_date, is_open")
      .lte("cal_date", anchorShanghai)
      .eq("exchange", "SSE")
      .order("cal_date", { ascending: false })
      .limit(30);

    const open = (data ?? []).find((r) => r.is_open === true);
    if (open?.cal_date) return String(open.cal_date);
  }

  return fallbackAsOfTradeDate(anchorShanghai);
}

function fallbackAsOfTradeDate(anchor: string): string {
  const d = new Date(`${anchor}T12:00:00+08:00`);
  for (let i = 0; i < 14; i++) {
    const cur = new Date(d);
    cur.setDate(cur.getDate() - i);
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) {
      return yyyymmdd(cur).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    }
  }
  return anchor;
}
