import type { L0FundSnapshot, L0TopHolding, HoldingAssetType, L0DividendRecord } from "./types";
import { fetchEastMoneyMoneyFundDailyHistory } from "@/lib/l0/akshare-client";
import { cleanDividendHistory, fetchFundDividendsEm } from "@/lib/l0/eastmoney-client";
import { fetchFundFeeRulesXq } from "@/lib/l0/xueqiu-client";
import { parseL0FeeRatesFromBasic } from "@/lib/kb/disclosure-parse";
import { webSearch } from "@/harness/tools/web_search";
import type { WebSearchResult } from "@/harness/tools/web_search.types";

interface TusharePayload {
  code: number;
  msg: string | null;
  data?: {
    fields: string[];
    items: unknown[][];
  };
}

function parseTable(data: TusharePayload["data"]): Record<string, unknown>[] {
  if (!data?.fields?.length) return [];
  return data.items.map((row) => {
    const obj: Record<string, unknown> = {};
    data.fields.forEach((field, i) => {
      obj[field] = row[i];
    });
    return obj;
  });
}

export async function tushareQuery(input: {
  token: string;
  apiName: string;
  params?: Record<string, unknown>;
  fields: string;
}): Promise<Record<string, unknown>[]> {
  const res = await fetch("http://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_name: input.apiName,
      token: input.token,
      params: input.params ?? {},
      fields: input.fields,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error("Tushare 连接超时或网络异常");
  }

  const json = (await res.json()) as TusharePayload;
  if (json.code !== 0) {
    throw new Error(json.msg ?? "Tushare 返回错误");
  }
  return parseTable(json.data);
}

export function fundTsCode(fundCode: string): string {
  return `${fundCode}.OF`;
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function normalizeHkTsCode(symbol: string): string {
  const m = symbol.match(/^(\d{1,5})\.HK$/i);
  if (!m) return symbol.toUpperCase();
  return `${m[1].padStart(5, "0")}.HK`;
}

function extractSecurityNameFromSearch(
  result: WebSearchResult,
  code: string,
): string | null {
  const haystack = [
    result.summary,
    ...result.citations.map((c) => `${c.title} ${c.url}`),
  ].join("\n");
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s*[·\\-:]\\s*([^\\n，,；;。]+)`),
    new RegExp(`([^\\n，,；;。]{2,20})\\s*[\\(\\（]\\s*${escaped}\\s*[\\)\\）]`),
    /股票简称[：:]?\\s*([^\\n，,；;。]+)/,
    /公司简称[：:]?\\s*([^\\n，,；;。]+)/,
    /公司名称[：:]?\\s*([^\\n，,；;。]+)/,
    /证券简称[：:]?\\s*([^\\n，,；;。]+)/,
  ];
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m) {
      const candidate = m[1].trim().replace(/\\s+/g, "");
      if (/[\u4e00-\u9fff]/.test(candidate) && candidate.length >= 2 && candidate.length <= 30) {
        return candidate;
      }
    }
  }
  return null;
}

function isoFromYyyymmdd(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function computeDrawdown(navSeries: number[]): number | undefined {
  if (navSeries.length < 2) return undefined;
  let peak = navSeries[0]!;
  let maxDd = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    const dd = (nav - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 1000) / 10;
}

export async function testTushareToken(token: string): Promise<void> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const rows = await tushareQuery({
    token,
    apiName: "trade_cal",
    params: {
      exchange: "SSE",
      start_date: yyyymmdd(start),
      end_date: yyyymmdd(end),
    },
    fields: "cal_date,is_open",
  });
  if (!rows.length) {
    throw new Error("Tushare 未返回交易日历数据，请检查 Token 或积分权限");
  }
}

function inferAssetType(symbol: string, name: string): HoldingAssetType {
  const s = `${symbol} ${name}`.toUpperCase();
  if (/同业存单|CD/.test(s)) return "cd";
  if (/债|BOND|国债|信用/.test(s)) return "bond";
  if (/\.OF|ETF|基金/.test(s)) return "fund";
  if (/\.SH|\.SZ|\.BJ|\.HK|\d{6}/.test(symbol)) return "stock";
  return "other";
}

async function resolveSecurityNames(
  symbols: string[],
  token: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(symbols.filter(Boolean))];
  if (!unique.length) return map;

  const stockCodes = unique.filter((s) => /\.(SH|SZ|BJ)$/i.test(s));
  const fundCodes = unique.filter((s) => /\.OF$/i.test(s));
  const hkCodes = unique.filter((s) => /\.HK$/i.test(s));
  // 美股代码通常无后缀，例如 AAPL、BABA，也可能包含点如 BRK.B
  const usCodes = unique.filter(
    (s) => !/\.(SH|SZ|BJ|OF|HK)$/i.test(s) && /^[A-Za-z][A-Za-z0-9.]*$/.test(s),
  );

  if (stockCodes.length) {
    const rows = await tushareQuery({
      token,
      apiName: "stock_basic",
      params: { ts_code: stockCodes.join(",") },
      fields: "ts_code,name",
    });
    for (const r of rows) {
      const code = String(r.ts_code ?? "");
      if (code && r.name) map.set(code, String(r.name));
    }
  }

  if (fundCodes.length) {
    const rows = await tushareQuery({
      token,
      apiName: "fund_basic",
      params: { ts_code: fundCodes.join(",") },
      fields: "ts_code,name",
    });
    for (const r of rows) {
      const code = String(r.ts_code ?? "");
      if (code && r.name) map.set(code, String(r.name));
    }
  }

  if (hkCodes.length) {
    const normalized = hkCodes.map(normalizeHkTsCode);
    const results = await Promise.all(
      normalized.map((code) =>
        tushareQuery({
          token,
          apiName: "hk_basic",
          params: { ts_code: code },
          fields: "ts_code,name",
        }).catch(() => [] as Record<string, unknown>[])
      )
    );
    const rows = results.flat();
    for (const r of rows) {
      const code = String(r.ts_code ?? "").toUpperCase();
      if (code && r.name) map.set(code, String(r.name));
    }
    // fund_portfolio 返回的港股代码可能缺前导零，把原始代码也映射到标准化后的名称
    for (const raw of hkCodes) {
      const norm = normalizeHkTsCode(raw);
      const name = map.get(norm);
      if (name) map.set(raw, name);
    }
  }

  if (usCodes.length) {
    const results = await Promise.all(
      usCodes.map((code) =>
        tushareQuery({
          token,
          apiName: "us_basic",
          params: { ts_code: code },
          fields: "ts_code,enname",
        }).catch(() => [] as Record<string, unknown>[])
      )
    );
    const rows = results.flat();
    for (const r of rows) {
      const code = String(r.ts_code ?? "").toUpperCase();
      if (code && r.enname) map.set(code, String(r.enname));
    }
  }

  // Tushare 未覆盖的代码，用联网搜索兜底补充中文名称
  const missing = unique.filter((s) => !map.has(s));
  if (missing.length && process.env.HARNESS_SKIP_L0_WEB !== "1") {
    for (const code of missing) {
      try {
        const isHk = /\.HK$/i.test(code);
        const isUs = /^[A-Za-z]/.test(code);
        const query = isHk
          ? `${normalizeHkTsCode(code)} 港股 股票简称`
          : isUs
            ? `${code} 美股 公司名称 中文`
            : `${code} 股票简称`;
        const result = await webSearch({ query, max_results: 3 });
        const name = extractSecurityNameFromSearch(result, code);
        if (name) map.set(code, name);
      } catch {
        /* ignore */
      }
    }
  }

  return map;
}

async function fetchFundPortfolioExtras(
  tsCode: string,
  token: string,
): Promise<Pick<L0FundSnapshot, "top_holdings" | "top_holdings_concentration" | "holdings_as_of">> {
  const rows = await tushareQuery({
    token,
    apiName: "fund_portfolio",
    params: { ts_code: tsCode },
    fields: "ts_code,end_date,symbol,mkv,stk_mkv_ratio,stk_float_ratio",
  });

  if (!rows.length) return {};

  rows.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
  const latestEnd = String(rows[0]!.end_date);
  const latestRows = rows.filter((r) => String(r.end_date) === latestEnd);
  const portfolioRows = latestRows.slice(0, 10);
  const symbols = portfolioRows.map((r) => String(r.symbol ?? ""));
  const nameMap = await resolveSecurityNames(symbols, token);

  const topHoldings: L0TopHolding[] = portfolioRows.map((r) => {
    const symbol = String(r.symbol ?? "");
    const resolvedName = nameMap.get(symbol);
    const displayName = resolvedName ?? symbol;
    const weight = r.stk_mkv_ratio != null ? Number(r.stk_mkv_ratio) : undefined;
    return {
      name: displayName,
      code: symbol.includes(".") ? symbol.split(".")[0] : symbol,
      asset_type: inferAssetType(symbol, displayName),
      weight_pct: weight != null && Number.isFinite(weight) ? Math.round(weight * 10) / 10 : undefined,
      market_value: r.mkv != null ? Number(r.mkv) : undefined,
    };
  });

  const concentration = topHoldings.reduce(
    (sum, h) => sum + (h.weight_pct ?? 0),
    0,
  );

  return {
    top_holdings: topHoldings,
    top_holdings_concentration:
      concentration > 0 ? Math.round(concentration * 10) / 10 : undefined,
    holdings_as_of: isoFromYyyymmdd(latestEnd.length === 8 ? latestEnd : latestEnd.replace(/-/g, "")),
  };
}

async function fetchFundManagers(
  tsCode: string,
  token: string,
): Promise<L0FundSnapshot["fund_managers"]> {
  const rows = await tushareQuery({
    token,
    apiName: "fund_manager",
    params: { ts_code: tsCode },
    fields: "ts_code,name,begin_date,end_date",
  });

  const today = yyyymmdd(new Date());
  return rows
    .filter((r) => r.name)
    .filter((r) => {
      const endRaw = r.end_date ? String(r.end_date).replace(/-/g, "").slice(0, 8) : "";
      return !endRaw || endRaw >= today;
    })
    .map((r) => ({
      name: String(r.name),
      begin_date: r.begin_date
        ? isoFromYyyymmdd(String(r.begin_date).replace(/-/g, "").slice(0, 8))
        : undefined,
      end_date: r.end_date
        ? isoFromYyyymmdd(String(r.end_date).replace(/-/g, "").slice(0, 8))
        : undefined,
    }))
    .slice(0, 5);
}

/** 从 Tushare fund_div 拉取分红记录 */
async function fetchFundDividends(
  tsCode: string,
  token: string,
): Promise<L0DividendRecord[]> {
  try {
    const rows = await tushareQuery({
      token,
      apiName: "fund_div",
      params: { ts_code: tsCode },
      fields: "ts_code,div_proc,record_date,ex_date,pay_date,earpay_date,div_cash,base_unit,ear_distr,ear_amount,report_date,ann_date",
    });

    return rows
      .filter((r) => r.ex_date && r.div_cash != null)
      .map((r) => ({
        ex_date: isoFromYyyymmdd(String(r.ex_date).replace(/-/g, "")),
        amount_per_share: r.div_cash != null ? Number(r.div_cash) : undefined,
        pay_date: r.pay_date
          ? isoFromYyyymmdd(String(r.pay_date).replace(/-/g, ""))
          : undefined,
      }))
      .filter((r) => r.amount_per_share != null && Number.isFinite(r.amount_per_share));
  } catch {
    return [];
  }
}

async function fetchFundShareSnapshot(
  tsCode: string,
  token: string,
  unitNav?: number,
): Promise<L0FundSnapshot["fund_share"]> {
  const rows = await tushareQuery({
    token,
    apiName: "fund_share",
    params: { ts_code: tsCode },
    fields: "ts_code,trade_date,fd_share",
  });
  if (!rows.length) return undefined;

  rows.sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
  const latest = rows[0]!;
  const fdShare = latest.fd_share != null ? Number(latest.fd_share) : undefined;
  const tradeDate = latest.trade_date
    ? isoFromYyyymmdd(String(latest.trade_date).replace(/-/g, "").slice(0, 8))
    : undefined;

  let aumYi: number | undefined;
  if (fdShare != null && unitNav != null && Number.isFinite(fdShare) && Number.isFinite(unitNav)) {
    aumYi = Math.round(((fdShare * 10000 * unitNav) / 1e8) * 100) / 100;
  }

  return {
    fd_share: fdShare,
    trade_date: tradeDate,
    aum_yi: aumYi,
  };
}

async function lookupIndexBasic(
  token: string,
  tsCode: string,
): Promise<{ ts_code: string; name: string } | null> {
  const rows = await tushareQuery({
    token,
    apiName: "index_basic",
    params: { ts_code: tsCode },
    fields: "ts_code,name",
  });
  if (!rows.length || !rows[0]?.ts_code) return null;
  return {
    ts_code: String(rows[0].ts_code),
    name: String(rows[0].name ?? tsCode),
  };
}

/** 从业绩基准文案推断 ts_code，再经 index_basic（doc 94）校验 */
export async function resolveBenchmarkIndex(
  benchmarkText: string,
  token: string,
): Promise<{ ts_code: string; name: string } | null> {
  const text = benchmarkText.trim();
  if (!text) return null;

  const embedded = text.match(/\b(\d{6}\.(?:SH|SZ|CSI|SI))\b/i);
  if (embedded?.[1]) {
    const hit = await lookupIndexBasic(token, embedded[1].toUpperCase());
    if (hit) return hit;
  }

  const hinted = resolvePrimaryIndexTsCode(text);
  if (hinted) {
    const hit = await lookupIndexBasic(token, hinted);
    if (hit) return hit;
  }

  return null;
}

function computeReturnFromCloses(closes: number[]): number | undefined {
  if (closes.length < 2) return undefined;
  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  if (first <= 0) return undefined;
  return Math.round(((last - first) / first) * 1000) / 10;
}

/** 业绩基准文案 → 主指数 ts_code（供 index_daily · doc 172） */
export const BENCHMARK_INDEX_MAP: ReadonlyArray<{ pattern: RegExp; ts_code: string }> = [
  { pattern: /沪深300|HS300|000300/i, ts_code: "000300.SH" },
  { pattern: /中证500|000905/i, ts_code: "000905.SH" },
  { pattern: /同业存单AAA|存单指数|中证同业存单/i, ts_code: "931059.CSI" },
  { pattern: /中证消费|消费指数|000932/i, ts_code: "000932.SH" },
  { pattern: /黄金|AU9999|SGE|上海金/i, ts_code: "AU9999.SGE" },
  { pattern: /中证全债|中债/i, ts_code: "000832.CSI" },
];

export function resolvePrimaryIndexTsCode(benchmarkText: string): string | null {
  const text = benchmarkText.trim();
  if (!text) return null;
  for (const { pattern, ts_code } of BENCHMARK_INDEX_MAP) {
    if (pattern.test(text)) return ts_code;
  }
  return null;
}

async function fetchBenchmarkExtras(input: {
  fundTsCode: string;
  token: string;
  navStartYmd: string;
  navEndYmd: string;
  fundReturn1y?: number;
}): Promise<
  Pick<
    L0FundSnapshot,
    "benchmark_name" | "benchmark_index_code" | "benchmark_return_1y_pct" | "excess_return_1y_pct"
  >
> {
  const benchRows = await tushareQuery({
    token: input.token,
    apiName: "fund_benchmark",
    params: { ts_code: input.fundTsCode },
    fields: "ts_code,benchmark",
  });
  const benchmarkName = benchRows[0]?.benchmark ? String(benchRows[0].benchmark) : undefined;
  if (!benchmarkName) return {};

  const indexHit = await resolveBenchmarkIndex(benchmarkName, input.token);
  if (!indexHit) return {};

  const indexRows = await tushareQuery({
    token: input.token,
    apiName: "index_daily",
    params: {
      ts_code: indexHit.ts_code,
      start_date: input.navStartYmd,
      end_date: input.navEndYmd,
    },
    fields: "trade_date,close",
  });

  indexRows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const closes = indexRows
    .map((r) => (r.close != null ? Number(r.close) : Number.NaN))
    .filter((n) => Number.isFinite(n));
  const benchmarkReturn = computeReturnFromCloses(closes);
  if (benchmarkReturn == null) return {};

  let excess: number | undefined;
  if (input.fundReturn1y != null) {
    excess = Math.round((input.fundReturn1y - benchmarkReturn) * 10) / 10;
  }

  return {
    benchmark_name: indexHit.name,
    benchmark_index_code: indexHit.ts_code,
    benchmark_return_1y_pct: benchmarkReturn,
    excess_return_1y_pct: excess,
  };
}

export async function fetchFundL0FromTushare(
  fundCode: string,
  token: string,
): Promise<L0FundSnapshot | null> {
  const tsCode = fundTsCode(fundCode);
  const basics = await tushareQuery({
    token,
    apiName: "fund_basic",
    params: { ts_code: tsCode },
    fields: "ts_code,name,fund_type,invest_type,type,risk_level,management,found_date,min_amount,exp_return",
  });

  if (!basics.length) return null;

  const basic = basics[0]!;
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() - 7);

  const navRows = await tushareQuery({
    token,
    apiName: "fund_nav",
    params: {
      ts_code: tsCode,
      start_date: yyyymmdd(start),
      end_date: yyyymmdd(end),
    },
    fields: "nav_date,unit_nav,accum_nav,adj_nav",
  });

  navRows.sort((a, b) => String(a.nav_date).localeCompare(String(b.nav_date)));

  const latest = navRows.at(-1);
  const earliest = navRows[0];
  const nav = latest?.unit_nav != null ? Number(latest.unit_nav) : undefined;
  const navAcc = latest?.accum_nav != null ? Number(latest.accum_nav) : undefined;
  const navDate = latest?.nav_date ? isoFromYyyymmdd(String(latest.nav_date)) : undefined;

  let return1y: number | undefined;
  if (nav != null && earliest?.unit_nav != null) {
    const base = Number(earliest.unit_nav);
    if (base > 0) {
      return1y = Math.round(((nav - base) / base) * 1000) / 10;
    }
  }

  const adjSeries = navRows
    .map((r) => (r.adj_nav != null ? Number(r.adj_nav) : Number(r.unit_nav)))
    .filter((n) => Number.isFinite(n));
  const maxDd = computeDrawdown(adjSeries);

  const name = String(basic.name ?? fundCode);
  const fundType = basic.fund_type != null ? String(basic.fund_type) : "";

  const investType = basic.invest_type != null ? String(basic.invest_type) : undefined;
  const typeLabel = basic.type != null ? String(basic.type) : undefined;
  const foundDate = basic.found_date != null ? isoFromYyyymmdd(String(basic.found_date)) : undefined;
  const minAmount = basic.min_amount != null ? Number(basic.min_amount) : undefined;
  const expReturn = basic.exp_return != null ? Number(basic.exp_return) : undefined;

  let portfolioExtras: Pick<
    L0FundSnapshot,
    "top_holdings" | "top_holdings_concentration" | "holdings_as_of"
  > = {
    top_holdings: [],
  };
  try {
    portfolioExtras = await fetchFundPortfolioExtras(tsCode, token);
  } catch {
    /* holdings optional */
  }

  let managerExtras: Pick<L0FundSnapshot, "fund_managers" | "fund_share"> = {};
  try {
    const [managers, share] = await Promise.all([
      fetchFundManagers(tsCode, token),
      fetchFundShareSnapshot(tsCode, token, nav),
    ]);
    managerExtras = {
      fund_managers: managers?.length ? managers : undefined,
      fund_share: share,
    };
  } catch {
    /* manager/share optional */
  }

  const navStartYmd = earliest?.nav_date
    ? String(earliest.nav_date).replace(/-/g, "").slice(0, 8)
    : yyyymmdd(start);
  const navEndYmd = latest?.nav_date
    ? String(latest.nav_date).replace(/-/g, "").slice(0, 8)
    : yyyymmdd(end);

  let benchmarkExtras: Pick<
    L0FundSnapshot,
    "benchmark_name" | "benchmark_index_code" | "benchmark_return_1y_pct" | "excess_return_1y_pct"
  > = {};
  try {
    benchmarkExtras = await fetchBenchmarkExtras({
      fundTsCode: tsCode,
      token,
      navStartYmd,
      navEndYmd,
      fundReturn1y: return1y,
    });
  } catch {
    /* benchmark optional */
  }

  // 拉取分红记录（Tushare + EastMoney 两层兜底）
  let dividendHistory: L0DividendRecord[] = [];
  try {
    dividendHistory = await fetchFundDividends(tsCode, token);
  } catch {
    /* ignore */
  }

  // EastMoney 兜底/清洗
  const emDividends = await fetchFundDividendsEm(fundCode).catch(() => []);
  if (emDividends.length > 0) {
    // 如果 Tushare 没有数据，或者 Tushare 数据有脏记录（ex_date 为空/重复），优先使用 EastMoney
    const hasDirty = dividendHistory.some(
      (d) => !d.ex_date || d.ex_date.trim() === "" || !d.amount_per_share,
    );
    const hasDuplicates =
      new Set(dividendHistory.map((d) => `${d.ex_date}|${d.amount_per_share}`)).size !==
      dividendHistory.length;
    if (dividendHistory.length === 0 || hasDirty || hasDuplicates) {
      dividendHistory = emDividends;
    }
  }

  dividendHistory = cleanDividendHistory(dividendHistory);

  // 拉取雪球费率规则（申购/赎回/其他费率）
  const feeRulesXq = await fetchFundFeeRulesXq(fundCode).catch(() => null);

  // 拉取货币基金每日万份收益全量历史（从 pingzhongdata）
  const moneyDailyIncome = String(basic.fund_type) === "货币型"
    ? await fetchEastMoneyMoneyFundDailyHistory(fundCode).catch(() => [])
    : [];

  return {
    fund_code: fundCode,
    fund_name: name,
    fund_type: fundType || "开放式基金",
    risk_level: basic.risk_level ? String(basic.risk_level) : undefined,
    is_qdii: /QDII|qdii/i.test(name + fundType),
    is_index: /指数|ETF|index/i.test(name + fundType),
    lookup_source: "tushare",
    metrics: navDate
      ? {
          as_of_trade_date: navDate,
          nav,
          nav_acc: navAcc,
          return_1y_pct: return1y,
          max_drawdown_1y_pct: maxDd,
          ...(moneyDailyIncome.length > 0 ? {
            money_fund_daily_income: moneyDailyIncome,
          } : {}),
        }
      : undefined,
    found_date: foundDate,
    min_amount: minAmount,
    exp_return: expReturn,
    invest_type: investType,
    type_label: typeLabel,
    management: basic.management != null ? String(basic.management) : undefined,
    ...portfolioExtras,
    ...managerExtras,
    ...benchmarkExtras,
    dividend_history: dividendHistory,
    fee_rates: parseL0FeeRatesFromBasic({
      management: basic.management != null ? String(basic.management) : undefined,
    }),
    fee_rules_xq: feeRulesXq ?? undefined,
  };
}
