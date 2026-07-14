import { tushareQuery } from "@/lib/l0/tushare-client";

export interface IndexWindowMetrics {
  vol_annual_pct: number;
  max_drawdown_pct: number;
  window_years: number;
  source: "tushare" | "akshare" | "anchor" | "missing";
}

export interface PlanRiskMetrics {
  vol_range: string;
  drawdown_range: string;
  liquidity_note: string;
  disclaimer: string;
  has_index_data: boolean;
  components: {
    stock?: IndexWindowMetrics;
    bond?: IndexWindowMetrics;
    cash?: IndexWindowMetrics;
  };
}

const PLAN_RISK_DISCLAIMER =
  "按您确认的大类比例，参照 **沪深300、中证全债（或上证国债代表）、货币市场指数** 近 **3～5 年** 公开历史 **粗算**，**非**本方案所选基金之回测，**非**收益或回撤承诺。";

const ANCHORS = {
  stock: { vol3: 16, vol5: 18, dd3: -14, dd5: -18 },
  bond: { vol3: 2.5, vol5: 3.2, dd3: -2.5, dd5: -3.5 },
  cash: { vol3: 0.5, vol5: 0.6, dd3: -0.2, dd5: -0.3 },
} as const;

function tradingDaysYears(days: number): number {
  return Math.round((days / 252) * 10) / 10;
}

function dailyReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    if (prev > 0) rets.push(cur / prev - 1);
  }
  return rets;
}

function annualizedVol(rets: number[]): number {
  if (rets.length < 20) return NaN;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  return Math.round(Math.sqrt(variance * 252) * 1000) / 10;
}

function maxDrawdownPct(closes: number[]): number {
  if (closes.length < 2) return NaN;
  let peak = closes[0]!;
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 1000) / 10;
}

function metricsFromCloses(
  closes: number[],
  windowDays: number,
  source: IndexWindowMetrics["source"],
): IndexWindowMetrics | null {
  const slice = closes.slice(-windowDays);
  if (slice.length < Math.min(windowDays * 0.6, 120)) return null;
  const rets = dailyReturns(slice);
  const vol = annualizedVol(rets);
  const dd = maxDrawdownPct(slice);
  if (!Number.isFinite(vol) || !Number.isFinite(dd)) return null;
  return {
    vol_annual_pct: vol,
    max_drawdown_pct: dd,
    window_years: tradingDaysYears(windowDays),
    source,
  };
}

async function fetchTushareIndexCloses(tsCode: string): Promise<number[]> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token) return [];
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rows = await tushareQuery({
    token,
    apiName: "index_daily",
    params: { ts_code: tsCode, start_date: fmt(start), end_date: fmt(end) },
    fields: "trade_date,close",
  });
  rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  return rows
    .map((r) => (r.close != null ? Number(r.close) : Number.NaN))
    .filter((n) => Number.isFinite(n));
}

function anchorMetrics(kind: keyof typeof ANCHORS): {
  m3: IndexWindowMetrics;
  m5: IndexWindowMetrics;
} {
  const a = ANCHORS[kind];
  return {
    m3: {
      vol_annual_pct: a.vol3,
      max_drawdown_pct: a.dd3,
      window_years: 3,
      source: "anchor",
    },
    m5: {
      vol_annual_pct: a.vol5,
      max_drawdown_pct: a.dd5,
      window_years: 5,
      source: "anchor",
    },
  };
}

function mergeRange(values: number[]): string {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return "—";
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (Math.abs(lo - hi) < 0.05) return `${Math.abs(lo).toFixed(1)}%`;
  return `${Math.min(lo, hi).toFixed(1)}%–${Math.max(lo, hi).toFixed(1)}%`;
}

function mergeDrawdownRange(values: number[]): string {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return "—";
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  return `${lo.toFixed(0)}% ~ ${hi.toFixed(0)}%`;
}

function compositeVol(weights: Record<string, number>, vols: Record<string, number>): number {
  let sum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = vols[k] ?? 0;
    sum += (w / 100) ** 2 * v ** 2;
  }
  return Math.round(Math.sqrt(sum) * 10) / 10;
}

function compositeDd(weights: Record<string, number>, dds: Record<string, number>): number {
  let sum = 0;
  for (const [k, w] of Object.entries(weights)) {
    sum += (w / 100) * Math.abs(dds[k] ?? 0);
  }
  return Math.round(sum * 10) / 10;
}

export async function fetchCategoryIndexMetrics(): Promise<{
  stock: IndexWindowMetrics[];
  bond: IndexWindowMetrics[];
  cash: IndexWindowMetrics[];
  has_live: boolean;
}> {
  const result: {
    stock: IndexWindowMetrics[];
    bond: IndexWindowMetrics[];
    cash: IndexWindowMetrics[];
    has_live: boolean;
  } = { stock: [], bond: [], cash: [], has_live: false };

  try {
    const [stockCloses, bondCloses, cashCloses] = await Promise.all([
      fetchTushareIndexCloses("000300.SH"),
      fetchTushareIndexCloses("000832.CSI"),
      fetchTushareIndexCloses("H11025.CSI"),
    ]);
    if (stockCloses.length) {
      const m3 = metricsFromCloses(stockCloses, 756, "tushare");
      const m5 = metricsFromCloses(stockCloses, 1260, "tushare");
      if (m3) result.stock.push(m3);
      if (m5) result.stock.push(m5);
      result.has_live = true;
    }
    if (bondCloses.length) {
      const m3 = metricsFromCloses(bondCloses, 756, "tushare");
      const m5 = metricsFromCloses(bondCloses, 1260, "tushare");
      if (m3) result.bond.push(m3);
      if (m5) result.bond.push(m5);
      result.has_live = true;
    }
    if (cashCloses.length) {
      const m3 = metricsFromCloses(cashCloses, 756, "tushare");
      const m5 = metricsFromCloses(cashCloses, 1260, "tushare");
      if (m3) result.cash.push(m3);
      if (m5) result.cash.push(m5);
      result.has_live = true;
    }
  } catch {
    /* fall through to anchors */
  }

  if (!result.stock.length) {
    const a = anchorMetrics("stock");
    result.stock.push(a.m3, a.m5);
  }
  if (!result.bond.length) {
    const a = anchorMetrics("bond");
    result.bond.push(a.m3, a.m5);
  }
  if (!result.cash.length) {
    const a = anchorMetrics("cash");
    result.cash.push(a.m3, a.m5);
  }

  return result;
}

export function deriveRiskMetricsFromIndices(input: {
  weights: { 股票类?: number; 债券类?: number; 货币类?: number };
  indexMetrics: Awaited<ReturnType<typeof fetchCategoryIndexMetrics>>;
  goalType: string;
  hasQdii?: boolean;
}): PlanRiskMetrics {
  const w = {
    股票类: input.weights.股票类 ?? 0,
    债券类: input.weights.债券类 ?? 0,
    货币类: input.weights.货币类 ?? 0,
  };

  const stockVol = input.indexMetrics.stock.map((m) => m.vol_annual_pct);
  const bondVol = input.indexMetrics.bond.map((m) => m.vol_annual_pct);
  const cashVol = input.indexMetrics.cash.map((m) => m.vol_annual_pct);
  const stockDd = input.indexMetrics.stock.map((m) => m.max_drawdown_pct);
  const bondDd = input.indexMetrics.bond.map((m) => m.max_drawdown_pct);
  const cashDd = input.indexMetrics.cash.map((m) => m.max_drawdown_pct);

  const volLo = compositeVol(w, {
    股票类: Math.min(...stockVol),
    债券类: Math.min(...bondVol),
    货币类: Math.min(...cashVol),
  });
  const volHi = compositeVol(w, {
    股票类: Math.max(...stockVol),
    债券类: Math.max(...bondVol),
    货币类: Math.max(...cashVol),
  });

  const ddLo = -compositeDd(w, {
    股票类: Math.min(...stockDd.map(Math.abs)),
    债券类: Math.min(...bondDd.map(Math.abs)),
    货币类: Math.min(...cashDd.map(Math.abs)),
  });
  const ddHi = -compositeDd(w, {
    股票类: Math.max(...stockDd.map(Math.abs)),
    债券类: Math.max(...bondDd.map(Math.abs)),
    货币类: Math.max(...cashDd.map(Math.abs)),
  });

  const vol_range =
    volLo === volHi ? `${volLo}%` : `${Math.min(volLo, volHi)}%–${Math.max(volLo, volHi)}%`;
  const drawdown_range =
    ddLo === ddHi ? `${ddLo.toFixed(0)}%` : `${ddLo.toFixed(0)}% ~ ${ddHi.toFixed(0)}%`;

  const liquidityByGoal: Record<string, string> = {
    retirement: "货币 **T+1** · 债券 **T+1~T+3** · 退休前原则上不动，保留应急",
    education: "距目标年前 **1 年** 起逐步提高流动性；货币与短债优先",
    housing: "距买房 **1 年** 前可逐步降权益、增货币；债券 **T+1~T+3**",
    marriage_child: "2–3 年节点前 **6 个月** 起提高货币占比；整体 **T+1~T+3**",
    wealth_growth: "非应急金；货币 **T+1** · 其余 **T+1~T+3**",
  };

  let disclaimer = PLAN_RISK_DISCLAIMER;
  if (input.hasQdii) {
    disclaimer += " 权益含 QDII 部分还受海外与汇率影响。";
  }
  if (!input.indexMetrics.has_live) {
    disclaimer += " （部分代表指数序列不可用，已用固定锚点粗算。）";
  }

  return {
    vol_range,
    drawdown_range,
    liquidity_note: liquidityByGoal[input.goalType] ?? liquidityByGoal.retirement!,
    disclaimer,
    has_index_data: input.indexMetrics.has_live,
    components: {
      stock: input.indexMetrics.stock[0],
      bond: input.indexMetrics.bond[0],
      cash: input.indexMetrics.cash[0],
    },
  };
}
