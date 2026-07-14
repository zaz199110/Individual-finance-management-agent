import type { ParsedFeeRates } from "@/lib/kb/disclosure-parse";
import type { L0AssetAllocation } from "@/lib/l0/registry-portfolio";
import {
  cleanDividendHistory,
  concentrationFromHoldings,
  fetchFundBondHoldingsEm,
  fetchFundDividendsEm,
  fetchFundOverviewEm,
  fetchFundStockHoldingsEm,
} from "@/lib/l0/eastmoney-client";
import type { L0FundSnapshot, L0FundManagerRecord } from "@/lib/l0/types";
import { fetchAssetAllocationXq, fetchFundBasicInfoXq, fetchFundFeeRulesXq, fetchIndustryAllocationEm } from "@/lib/l0/xueqiu-client";

interface EastMoneyNavRow {
  FSRQ?: string;
  DWJZ?: string;
  LJJZ?: string;
}

interface EastMoneyNavResponse {
  Data?: { LSJZList?: EastMoneyNavRow[] };
  ErrCode?: number;
}

interface EastMoneyFundMeta {
  fund_name?: string;
  fund_type?: string;
  is_qdii?: boolean;
  is_index?: boolean;
}

export interface MoneyFundDailyIncomeRecord {
  date: string;
  income_per_10k: number;
}

const EASTMONEY_HEADERS = { Referer: "https://fund.eastmoney.com/" };

function parsePingZhongFundMeta(text: string): EastMoneyFundMeta {
  const dq = String.fromCharCode(34);
  const name = new RegExp("var fS_name = " + dq + "([^" + dq + "]+)" + dq).exec(text)?.[1];
  const fundType = inferFundTypeFromName(name);
  return {
    fund_name: name,
    fund_type: fundType,
    is_qdii: /QDII/i.test(name ?? ""),
    is_index: /指数|ETF/i.test(name ?? ""),
  };
}

function inferFundTypeFromName(name?: string): string {
  if (!name) return "开放式基金";
  if (/货币/i.test(name)) return "货币型";
  if (/债券/i.test(name)) return "债券型";
  if (/混合/i.test(name)) return "混合型";
  if (/QDII/i.test(name)) return "QDII";
  if (/指数|ETF/i.test(name)) return "指数型";
  if (/股票/i.test(name)) return "股票型";
  return "开放式基金";
}

function mergeFeeRates(
  primary?: ParsedFeeRates,
  secondary?: ParsedFeeRates,
): ParsedFeeRates | undefined {
  if (!primary && !secondary) return undefined;
  return {
    management_pct: primary?.management_pct ?? secondary?.management_pct,
    custody_pct: primary?.custody_pct ?? secondary?.custody_pct,
    sales_service_pct: primary?.sales_service_pct ?? secondary?.sales_service_pct,
    subscription_max_pct: primary?.subscription_max_pct ?? secondary?.subscription_max_pct,
  };
}

function parseManagers(raw?: string): L0FundManagerRecord[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(/[\s、,，]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

/** 从 pingzhongdata/{code}.js 中提取 Data_millionCopiesIncome 全量万份收益序列 */
function extractMillionCopiesIncome(text: string): MoneyFundDailyIncomeRecord[] {
  const match = /Data_millionCopiesIncome\s*=\s*(\[\[[\s\S]*?\]\]);/.exec(text);
  if (!match?.[1]) return [];
  const raw = match[1];
  const result: MoneyFundDailyIncomeRecord[] = [];
  const pairRegex = /\[(\d+),([\d.]+)\]/g;
  let pm: RegExpExecArray | null;
  while ((pm = pairRegex.exec(raw)) !== null) {
    const ts = Number(pm[1]!);
    const income = Number(pm[2]!);
    if (!Number.isFinite(ts) || !Number.isFinite(income) || income < 0) continue;
    result.push({ date: new Date(ts).toISOString().slice(0, 10), income_per_10k: Math.round(income * 10000) / 10000 });
  }
  return result;
}

/** 获取货币基金全量每日万份收益历史（从 pingzhongdata/{code}.js） */
export async function fetchEastMoneyMoneyFundDailyHistory(fundCode: string): Promise<MoneyFundDailyIncomeRecord[]> {
  const res = await fetch(
    `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`,
    { headers: EASTMONEY_HEADERS, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return [];
  const text = await res.text();
  return extractMillionCopiesIncome(text);
}

async function fetchEastMoneyFundMeta(fundCode: string): Promise<EastMoneyFundMeta | null> {
  const res = await fetch(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`, {
    headers: EASTMONEY_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const meta = parsePingZhongFundMeta(text);
  return meta.fund_name ? meta : null;
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

async function fetchEastMoneyNavHistory(fundCode: string): Promise<EastMoneyNavRow[]> {
  const pageSize = 20;
  const maxPages = 13;
  const pages = await Promise.all(
    Array.from({ length: maxPages }, (_, index) =>
      fetch(
        `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=${index + 1}&pageSize=${pageSize}&startDate=&endDate=`,
        { headers: EASTMONEY_HEADERS, signal: AbortSignal.timeout(12000) },
      ).then((res) => (res.ok ? res.json() : null) as Promise<EastMoneyNavResponse | null>),
    ),
  );

  const navList: EastMoneyNavRow[] = [];
  for (const json of pages) {
    const batch = json?.Data?.LSJZList ?? [];
    if (!batch.length) break;
    navList.push(...batch);
  }
  return navList;
}

async function resolveLiveHoldings(fundCode: string): Promise<{
  top_holdings?: L0FundSnapshot["top_holdings"];
  top_holdings_concentration?: number;
  holdings_as_of?: string;
}> {
  const year = String(new Date().getFullYear() - 1);
  const stock = await fetchFundStockHoldingsEm(fundCode, year).catch(() => null);
  if (stock?.holdings.length) {
    return {
      top_holdings: stock.holdings,
      top_holdings_concentration: concentrationFromHoldings(stock.holdings),
      holdings_as_of: stock.as_of,
    };
  }
  const bond = await fetchFundBondHoldingsEm(fundCode, year).catch(() => null);
  if (bond?.holdings.length) {
    return {
      top_holdings: bond.holdings,
      top_holdings_concentration: concentrationFromHoldings(bond.holdings),
      holdings_as_of: bond.as_of,
    };
  }
  return {};
}

export async function testAkShareConnectivity(): Promise<void> {
  const res = await fetch(
    "https://api.fund.eastmoney.com/f10/lsjz?fundCode=110022&pageIndex=1&pageSize=5&startDate=&endDate=",
    { headers: EASTMONEY_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error("AKShare 等价接口连接失败");
  const json = (await res.json()) as EastMoneyNavResponse;
  if (!json.Data?.LSJZList?.length) {
    throw new Error("AKShare 等价接口未返回基金数据");
  }
}

export async function fetchFundL0FromAkShare(
  fundCode: string,
): Promise<L0FundSnapshot | null> {
  const [info, navList, overview, holdings, assetXq, feeRules, industryAlloc, xqBasicInfo, dividendHistory] = await Promise.all([
    fetchEastMoneyFundMeta(fundCode),
    fetchEastMoneyNavHistory(fundCode),
    fetchFundOverviewEm(fundCode).catch(() => null),
    resolveLiveHoldings(fundCode),
    fetchAssetAllocationXq(fundCode, "2024-12-31").catch(() => null),
    fetchFundFeeRulesXq(fundCode).catch(() => null),
    fetchIndustryAllocationEm(fundCode).catch(() => null),
    fetchFundBasicInfoXq(fundCode).catch(() => null),
    fetchFundDividendsEm(fundCode).catch(() => []),
  ]);

  // Fetch money fund daily income history if this is a money market fund
  const moneyDailyIncome = (info?.fund_type === "货币型" || /货币/i.test(info?.fund_name ?? ""))
    ? await fetchEastMoneyMoneyFundDailyHistory(fundCode).catch(() => [])
    : [];

  if (!info?.fund_name && !overview?.fund_name) return null;
  if (!navList.length) return null;

  navList.sort((a, b) => String(a.FSRQ).localeCompare(String(b.FSRQ)));
  const latest = navList.at(-1);
  const earliest = navList[0];
  const nav = latest?.DWJZ ? Number(latest.DWJZ) : undefined;
  const navAcc = latest?.LJJZ ? Number(latest.LJJZ) : undefined;
  const navDate = latest?.FSRQ;

  let return1y: number | undefined;
  if (nav != null && earliest?.DWJZ) {
    const base = Number(earliest.DWJZ);
    if (base > 0) return1y = Math.round(((nav - base) / base) * 1000) / 10;
  }

  const series = navList.map((r) => Number(r.DWJZ)).filter((n) => Number.isFinite(n));
  const maxDd = computeDrawdown(series);

  const name = overview?.fund_name ?? info!.fund_name!;
  const fundType = overview?.fund_type ?? info?.fund_type ?? "开放式基金";
  const benchmarkName = overview?.benchmark_name?.trim();
  const fee_rates = mergeFeeRates(undefined, overview?.fee_rates);
  const fund_managers = parseManagers(overview?.fund_managers);
  const asset_allocation: L0AssetAllocation | undefined = assetXq?.allocation;

  return {
    fund_code: fundCode,
    fund_name: name,
    fund_type: fundType,
    risk_level: undefined,
    is_qdii: info?.is_qdii ?? /QDII/i.test(name + fundType),
    is_index: info?.is_index ?? /指数/i.test(name + fundType),
    lookup_source: "akshare",
    l0_degraded: false,
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
    top_holdings: holdings.top_holdings,
    top_holdings_concentration: holdings.top_holdings_concentration,
    holdings_as_of: holdings.holdings_as_of,
    holdings_source: holdings.top_holdings?.length ? "live" : undefined,
    fund_managers,
    benchmark_name:
      (xqBasicInfo?.benchmark && !/不设|暂无|无跟踪/.test(xqBasicInfo.benchmark)
        ? xqBasicInfo.benchmark
        : benchmarkName && !/不设|暂无|无跟踪/.test(benchmarkName)
          ? benchmarkName
          : undefined),
    fee_rates,
    asset_allocation,
    fee_rules_xq: feeRules ?? undefined,
    industry_allocation: industryAlloc ?? undefined,
    dividend_history: cleanDividendHistory(dividendHistory),
  };
}
