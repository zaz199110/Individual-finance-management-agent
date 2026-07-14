import type { L0AssetAllocation } from "@/lib/l0/registry-portfolio";

const XQ_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

interface XqAssetPercentResponse {
  data?: {
    source?: string;
    stock_percent?: number;
    bond_percent?: number;
    cash_percent?: number;
    other_percent?: number;
    chart_list?: Array<{ type_desc?: string; percent?: number }>;
  };
}

function mapChartList(list?: Array<{ type_desc?: string; percent?: number }>): L0AssetAllocation {
  const alloc: L0AssetAllocation = {};
  for (const item of list ?? []) {
    const pct = item.percent;
    if (pct == null || !Number.isFinite(pct)) continue;
    const desc = item.type_desc ?? "";
    if (/股票|权益/.test(desc)) alloc.stock_pct = pct;
    else if (/债券|存单/.test(desc)) alloc.bond_pct = pct;
    else if (/现金|货币|存款/.test(desc)) alloc.cash_pct = pct;
    else alloc.other_pct = (alloc.other_pct ?? 0) + pct;
  }
  return alloc;
}

/** 雪球 · 持仓资产比例（AKShare fund_individual_detail_hold_xq 等价） */
export async function fetchAssetAllocationXq(
  fundCode: string,
  reportDate = "2024-12-31",
): Promise<{ allocation: L0AssetAllocation; as_of?: string } | null> {
  const params = new URLSearchParams({
    fund_code: fundCode,
    report_date: reportDate,
  });
  const res = await fetch(
    `https://danjuanfunds.com/djapi/fundx/base/fund/record/asset/percent?${params}`,
    { headers: XQ_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as XqAssetPercentResponse;
  const d = json.data;
  if (!d) return null;

  let allocation: L0AssetAllocation = {
    stock_pct: d.stock_percent,
    bond_pct: d.bond_percent,
    cash_pct: d.cash_percent,
    other_pct: d.other_percent,
  };

  const fromChart = mapChartList(d.chart_list);
  if (
    !allocation.stock_pct &&
    !allocation.bond_pct &&
    !allocation.cash_pct &&
    !allocation.other_pct &&
    (fromChart.stock_pct || fromChart.bond_pct || fromChart.cash_pct || fromChart.other_pct)
  ) {
    allocation = fromChart;
  }

  const hasData = [allocation.stock_pct, allocation.bond_pct, allocation.cash_pct, allocation.other_pct].some(
    (v) => v != null && v > 0,
  );
  if (!hasData) return null;

  return { allocation, as_of: d.source?.slice(0, 10) };
}

/** 雪球基金交易规则（买入/卖出/其他费用） · AKShare fund_individual_detail_info_xq 等价 */
export async function fetchFundFeeRulesXq(
  fundCode: string,
): Promise<Array<{ kind: string; condition: string; fee: number }> | null> {
  const res = await fetch(
    `https://danjuanfunds.com/djapi/fund/detail/${fundCode}`,
    { headers: XQ_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: {
      fund_rates?: {
        subscribe_rate_table?: Array<{ name?: string; value?: string; unit?: string }>;
        withdraw_rate_table?: Array<{ name?: string; value?: string; unit?: string }>;
        other_rate_table?: Array<{ name?: string; value?: string; unit?: string }>;
      };
    };
  };
  const rates = json.data?.fund_rates;
  if (!rates) return null;

  const rules: Array<{ kind: string; condition: string; fee: number }> = [];

  // 申购费 (subscribe)
  for (const item of rates.subscribe_rate_table ?? []) {
    if (item.name && item.value) {
      rules.push({ kind: "买入", condition: item.name, fee: parseFloat(item.value) || 0 });
    }
  }

  // 赎回费 (withdraw)
  for (const item of rates.withdraw_rate_table ?? []) {
    if (item.name && item.value) {
      rules.push({ kind: "赎回", condition: item.name, fee: parseFloat(item.value) || 0 });
    }
  }

  // 其他费用 (management, custody, etc.)
  for (const item of rates.other_rate_table ?? []) {
    if (item.name && item.value) {
      rules.push({ kind: "其他", condition: item.name, fee: parseFloat(item.value) || 0 });
    }
  }

  return rules.length > 0 ? rules : null;
}

/** 雪球基金基本信息（AKShare fund_individual_basic_info_xq 等价） */
export interface XqFundBasicInfo {
  fund_code?: string;
  fund_name?: string;
  fund_full_name?: string;
  setup_date?: string;
  latest_scale?: string;
  fund_company?: string;
  fund_manager?: string;
  custody_bank?: string;
  fund_type?: string;
  rating_agency?: string;
  fund_rating?: string;
  investment_strategy?: string;
  investment_goal?: string;
  /** 业绩比较基准 */
  benchmark?: string;
}

export async function fetchFundBasicInfoXq(
  fundCode: string,
): Promise<XqFundBasicInfo | null> {
  const res = await fetch(
    `https://danjuanfunds.com/djapi/fund/detail/${fundCode}`,
    { headers: XQ_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: {
      base_info?: {
        fd_code?: string;
        fd_name?: string;
        fd_full_name?: string;
        setup_date?: string;
        scale?: string | number;
        fund_company?: string;
        manager?: string;
        custody_bank?: string;
        fd_type?: string;
        rating_agency?: string;
        rating?: string;
        strategy?: string;
        goal?: string;
        benchmark?: string;
      };
    };
  };
  const info = json.data?.base_info;
  if (!info) return null;
  return {
    fund_code: info.fd_code,
    fund_name: info.fd_name,
    fund_full_name: info.fd_full_name,
    setup_date: info.setup_date,
    latest_scale: typeof info.scale === "number" ? `${info.scale}亿` : info.scale,
    fund_company: info.fund_company,
    fund_manager: info.manager,
    custody_bank: info.custody_bank,
    fund_type: info.fd_type,
    rating_agency: info.rating_agency,
    fund_rating: info.rating,
    investment_strategy: info.strategy,
    investment_goal: info.goal,
    benchmark: info.benchmark,
  };
}

/** 天天基金网-行业配置（单只基金） · AKShare fund_portfolio_industry_allocation_em 等价 */
export async function fetchIndustryAllocationEm(
  fundCode: string,
  year?: string,
): Promise<Array<{ industry: string; pct: number; market_value?: number; as_of?: string }> | null> {
  const date = year ?? String(new Date().getFullYear() - 1);
  const res = await fetch(
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10&year=${date}&month=`,
    { headers: XQ_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const text = await res.text();
  // 解析返回的表格数据（格式：序号、行业类别、占净值比例、市值、截止时间）
  const rows: Array<{ industry: string; pct: number; market_value?: number; as_of?: string }> = [];
  const regex = /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d-]+)<\/td>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const pct = parseFloat(match[3]);
    if (pct > 0) {
      rows.push({
        industry: match[2].trim(),
        pct,
        market_value: parseFloat(match[4]),
        as_of: match[5],
      });
    }
  }
  return rows.length > 0 ? rows : null;
}
