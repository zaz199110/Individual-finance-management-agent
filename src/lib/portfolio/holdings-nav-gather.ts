import { syncFundL0Local } from "@/lib/l0/l0-sync";
import type { L0DividendRecord, L0FundSnapshot } from "@/lib/l0/types";
import type { HoldingsPosition } from "./types";

export interface PortfolioPositionMetrics {
  fund_code: string;
  fund_name?: string;
  invested_at: string;
  fund_type?: string;
  paid_amount: number;
  shares: number;
  l0_ok: boolean;
  as_of_trade_date?: string;
  nav_latest?: number;
  market_value?: number;
  cash_dividend_total?: number;
  dividend_missing?: boolean;
  pnl_abs?: number;
  pnl_pct?: number;
  /** 混合基金股票仓位占比（从 L0 asset_allocation.stock_pct 获取） */
  stock_position_pct?: number;
  /** 货币基金万份收益（元） */
  daily_income_per_10k?: number;
  /** 货币基金七日年化收益率（%） */
  yield_7d_annual?: number;
  /** 是否为货币基金 */
  is_money_fund?: boolean;
  /** 在组合中的角色（由基金类型、名称关键词、仓位权重综合计算） */
  portfolio_role?: string;
}

export interface PortfolioGatherResult {
  as_of_trade_date: string;
  positions: PortfolioPositionMetrics[];
  total_cost: number;
  total_market_value: number;
  total_pnl_abs: number;
  total_pnl_pct: number;
  l0_degraded: string[];
  dividendMissingFunds: string[];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 计算单只基金在组合中的角色。
 *
 * 规则（顺序敏感，先匹配先胜出）：
 * 1. 货币基金 / 含「货币」「现金管理」「钱袋子」→ 流动性管理
 * 2. QDII / 海外关键词 → 海外分散
 * 3. 黄金/商品/原油 → 另类配置
 * 4. REITs → REITs配置
 * 5. 债券型：
 *    - 含「增强」「二级债」「可转债」→ 稳健增强
 *    - 否则 → 稳健底仓
 * 6. 股票型/混合型/指数型：
 *    - 含「白酒|消费|医药|医疗|科技|新能源|半导体|芯片|军工|银行|证券|地产|煤炭|钢铁|有色|化工|行业|主题」→ 行业主题配置
 *    - 否则 → 权益进攻
 * 7. 其它 → 组合配置
 *
 * 权重修饰（货币基金、QDII 等不加，避免歧义）：
 * - 占组合成本 >= 30%，或占同类成本 >= 40% 且占组合 >= 15% → 追加「（核心）」
 * - 占组合成本 <= 10% → 追加「（卫星）」
 */
export function computePortfolioRole(
  pos: PortfolioPositionMetrics,
  allPositions: PortfolioPositionMetrics[],
  totalCost: number,
): string {
  const name = (pos.fund_name ?? "").toLowerCase();
  const fundType = (pos.fund_type ?? "").toLowerCase();

  // 1. 货币基金优先
  if (pos.is_money_fund || /货币|现金管理|钱袋子/.test(fundType) || /货币|现金管理|钱袋子/.test(name)) {
    return "流动性管理";
  }

  // 2. QDII / 海外
  if (/qdii/.test(fundType) || /qdii|纳斯达克|标普|恒生|港股|美股|越南|印度|海外/.test(name)) {
    return "海外分散";
  }

  // 3. 商品类
  if (/黄金|商品|原油/.test(name)) {
    return "另类配置";
  }

  // 4. REITs
  if (/reits/.test(name)) {
    return "REITs配置";
  }

  let baseRole = "组合配置";

  // 5. 债券型
  if (/债|一级债|二级债|存单|利率/.test(fundType) || /债|存单|利率|纯债|增强回报|双息/.test(name)) {
    if (/增强|二级债|可转债/.test(fundType) || /增强|二级债|可转债/.test(name)) {
      baseRole = "稳健增强";
    } else {
      baseRole = "稳健底仓";
    }
  }
  // 6. 权益类
  else if (/股票|混合|指数|偏股|权益|etf/.test(fundType) || /股票|混合|指数|偏股|权益|etf/.test(name)) {
    if (/白酒|消费|医药|医疗|科技|新能源|半导体|芯片|军工|银行|证券|地产|煤炭|钢铁|有色|化工|行业|主题/.test(name)) {
      baseRole = "行业主题配置";
    } else {
      baseRole = "权益进攻";
    }
  }

  // 权重修饰：货币基金、QDII、商品、REITs 不加权重后缀
  if (baseRole === "流动性管理" || baseRole === "海外分散" || baseRole === "另类配置" || baseRole === "REITs配置") {
    return baseRole;
  }

  const cost = pos.paid_amount ?? 0;
  const weight = totalCost > 0 ? cost / totalCost : 0;

  const sameClassPositions = allPositions.filter((p) => {
    const pName = (p.fund_name ?? "").toLowerCase();
    const pType = (p.fund_type ?? "").toLowerCase();

    if (baseRole === "稳健底仓" || baseRole === "稳健增强") {
      return /债|一级债|二级债|存单|利率/.test(pType) || /债|存单|利率|纯债|增强回报|双息/.test(pName);
    }
    if (baseRole === "行业主题配置" || baseRole === "权益进攻") {
      return /股票|混合|指数|偏股|权益|etf/.test(pType) || /股票|混合|指数|偏股|权益|etf/.test(pName);
    }
    return false;
  });

  const classCost = sameClassPositions.reduce((s, p) => s + (p.paid_amount ?? 0), 0);
  const isClassCore = classCost > 0 && (cost / classCost) >= 0.4;

  if (weight >= 0.3 || (isClassCore && weight >= 0.15)) {
    return `${baseRole}（核心）`;
  }
  if (weight <= 0.1) {
    return `${baseRole}（卫星）`;
  }

  return baseRole;
}

/** 持有期 [invested_at, as_of] 内现金分红合计（元） */
export function sumCashDividendsForHolding(
  dividends: L0DividendRecord[] | undefined,
  investedAt: string,
  asOfTradeDate: string,
  shares: number,
): { total: number; missing: boolean } {
  if (!dividends?.length) {
    return { total: 0, missing: true };
  }
  const start = investedAt.slice(0, 10);
  const end = asOfTradeDate.slice(0, 10);
  let total = 0;
  let matched = false;
  for (const d of dividends) {
    const ex = d.ex_date?.slice(0, 10);
    if (!ex || ex < start || ex > end) continue;
    if (d.amount_per_share == null || !Number.isFinite(d.amount_per_share)) continue;
    matched = true;
    total += d.amount_per_share * shares;
  }
  return { total: roundMoney(total), missing: false };
}

/** 安全计算持有天数（invested_at → asOf），异常返回 0 */
function safeHoldingDays(investedAt: string, asOf: string): number {
  try {
    const start = new Date(investedAt.slice(0, 10));
    const end = new Date(asOf.slice(0, 10));
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  } catch {
    return 0;
  }
}

function metricsFromSnapshot(
  row: HoldingsPosition,
  snapshot: L0FundSnapshot,
): PortfolioPositionMetrics {
  const asOf = snapshot.metrics?.as_of_trade_date ?? new Date().toISOString().slice(0, 10);
  const nav = snapshot.metrics?.nav;
  const paid = Number(row.paid_amount) || 0;
  const shares = Number(row.shares) || 0;

  if (nav == null || !Number.isFinite(nav) || nav <= 0) {
    return {
      fund_code: row.fund_code,
      fund_name: row.fund_name ?? snapshot.fund_name,
      invested_at: row.invested_at,
      fund_type: snapshot.fund_type,
      paid_amount: paid,
      shares,
      l0_ok: false,
    };
  }

  // --- Money market fund branch: accumulate actual daily income ---
  const moneyFundDailyIncome = snapshot.metrics?.money_fund_daily_income;
  const isMoneyFund = moneyFundDailyIncome != null && moneyFundDailyIncome.length > 0;

  if (isMoneyFund && nav != null) {
    const holdingDays = safeHoldingDays(row.invested_at, asOf);

    // Market value ≈ shares (NAV ≈ 1.0 for money funds)
    const marketValue = roundMoney(shares * nav);

    // Accumulate daily income over the holding period: Σ (income_per_10k / 10000 × shares)
    let pnlAbs = 0;
    let pnlPct = 0;
    if (holdingDays > 0 && shares > 0) {
      const start = row.invested_at.slice(0, 10);
      const end = asOf.slice(0, 10);
      let totalIncome = 0;
      for (const r of moneyFundDailyIncome) {
        if (r.date < start) continue;
        if (r.date > end) break;
        totalIncome += r.income_per_10k;
      }
      pnlAbs = roundMoney(totalIncome / 10000 * shares);
      pnlPct = paid > 0 ? roundPct((pnlAbs / paid) * 100) : 0;
    }

    // Display fields: latest available data point
    const latest = moneyFundDailyIncome.at(-1);
    const dailyIncome = latest?.income_per_10k;

    // Compute 7-day annualized yield from last 7 entries
    let yield7d: number | undefined;
    if (moneyFundDailyIncome.length >= 7) {
      const last7 = moneyFundDailyIncome.slice(-7);
      const sum7d = last7.reduce((s, r) => s + r.income_per_10k, 0);
      if (sum7d > 0) {
        yield7d = roundPct(sum7d / 10000 * 365 / 7 * 100);
      }
    }

    return {
      fund_code: row.fund_code,
      fund_name: row.fund_name ?? snapshot.fund_name,
      invested_at: row.invested_at,
      fund_type: snapshot.fund_type,
      paid_amount: paid,
      shares,
      l0_ok: true,
      as_of_trade_date: asOf,
      nav_latest: nav,
      market_value: marketValue,
      cash_dividend_total: 0,
      dividend_missing: false,
      pnl_abs: pnlAbs,
      pnl_pct: pnlPct,
      daily_income_per_10k: dailyIncome,
      yield_7d_annual: yield7d,
      is_money_fund: true,
      stock_position_pct: snapshot.asset_allocation?.stock_pct,
    };
  }

  const marketValue = roundMoney(shares * nav);
  const div = sumCashDividendsForHolding(
    snapshot.dividend_history,
    row.invested_at,
    asOf,
    shares,
  );
  const pnlAbs = roundMoney(marketValue - paid + div.total);
  const pnlPct = paid > 0 ? roundPct((pnlAbs / paid) * 100) : 0;

  return {
    fund_code: row.fund_code,
    fund_name: row.fund_name ?? snapshot.fund_name,
    invested_at: row.invested_at,
    fund_type: snapshot.fund_type,
    paid_amount: paid,
    shares,
    l0_ok: true,
    as_of_trade_date: asOf,
    nav_latest: nav,
    market_value: marketValue,
    cash_dividend_total: div.total,
    dividend_missing: div.missing,
    pnl_abs: pnlAbs,
    pnl_pct: pnlPct,
    daily_income_per_10k: undefined,
    yield_7d_annual: undefined,
    is_money_fund: false,
    stock_position_pct: snapshot.asset_allocation?.stock_pct,
  };
}

/**
 * 持仓分析 gather：按基金去重 force sync L0，再算行级市值与持有收益。
 * PORT-L0-GATHER-01 · 单基失败不阻断整包。
 */
export async function gatherHoldingsNavMetrics(
  positions: HoldingsPosition[],
  options?: { force?: boolean },
): Promise<PortfolioGatherResult> {
  const force = options?.force !== false;
  const l0_degraded: string[] = [];
  const dividendMissingFunds: string[] = [];
  const snapshotByCode = new Map<string, L0FundSnapshot>();

  const uniqueCodes = [...new Set(positions.map((p) => p.fund_code))];
  const syncResults = await Promise.allSettled(
    uniqueCodes.map((code) => syncFundL0Local(code, { force })),
  );
  for (let i = 0; i < uniqueCodes.length; i++) {
    const code = uniqueCodes[i];
    const result = syncResults[i];
    if (result.status === "fulfilled" && result.value.ok && result.value.snapshot) {
      snapshotByCode.set(code, result.value.snapshot);
    } else {
      const error =
        result.status === "fulfilled"
          ? result.value.error ?? "未知错误"
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
      console.warn(`L0 同步失败 [${code}]:`, error);
      l0_degraded.push(`nav_missing:${code}`);
    }
  }

  const rowMetrics: PortfolioPositionMetrics[] = positions.map((row) => {
    const snapshot = snapshotByCode.get(row.fund_code);
    if (!snapshot) {
      return {
        fund_code: row.fund_code,
        fund_name: row.fund_name,
        invested_at: row.invested_at,
        paid_amount: Number(row.paid_amount) || 0,
        shares: Number(row.shares) || 0,
        l0_ok: false,
      };
    }
    const m = metricsFromSnapshot(row, snapshot);
    if (m.dividend_missing) {
      l0_degraded.push(`dividend_missing:${row.fund_code}:${row.invested_at}`);
      const fundLabel = row.fund_name ?? row.fund_code;
      if (!dividendMissingFunds.includes(fundLabel)) {
        dividendMissingFunds.push(fundLabel);
      }
    }
    return m;
  });

  const as_of_trade_date =
    rowMetrics
      .map((r) => r.as_of_trade_date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);

  const total_cost = roundMoney(
    rowMetrics.reduce((s, r) => s + r.paid_amount, 0),
  );
  const okRows = rowMetrics.filter((r) => r.l0_ok && r.market_value != null);
  const okCost = roundMoney(
    okRows.reduce((s, r) => s + r.paid_amount, 0),
  );
  const total_market_value = roundMoney(
    okRows.reduce((s, r) => s + (r.market_value ?? 0), 0),
  );
  const total_pnl_abs = roundMoney(
    okRows.reduce((s, r) => s + (r.pnl_abs ?? 0), 0),
  );
  // 使用 L0 成功的仓位成本作为分母，避免分母包含失败仓位导致收益率被低估
  const total_pnl_pct =
    okCost > 0 ? roundPct((total_pnl_abs / okCost) * 100) : 0;

  // 计算每只基金在组合中的角色
  const positionsWithRole = rowMetrics.map((pos) => ({
    ...pos,
    portfolio_role: computePortfolioRole(pos, rowMetrics, total_cost),
  }));

  return {
    as_of_trade_date,
    positions: positionsWithRole,
    total_cost,
    total_market_value,
    total_pnl_abs,
    total_pnl_pct,
    l0_degraded,
    dividendMissingFunds,
  };
}
