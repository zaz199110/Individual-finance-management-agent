export type LookupSource = "tushare" | "akshare" | "registry_demo" | "web_fallback";

export type CheckStatus = "unchecked" | "checking" | "passed" | "failed";

export interface L0NavMetrics {
  as_of_trade_date: string;
  nav?: number;
  nav_acc?: number;
  return_1y_pct?: number;
  max_drawdown_1y_pct?: number;
  /** 货币基金万份收益（元）· fund_money_fund_daily_em */
  daily_income_per_10k?: number;
  /** 货币基金七日年化收益率（%）· fund_money_fund_daily_em */
  yield_7d_annual?: number;
  /** 货币基金全量每日万份收益序列（从 pingzhongdata/{code}.js 提取），用于逐日累加计算持有期收益 */
  money_fund_daily_income?: Array<{ date: string; income_per_10k: number }>;
}

export type HoldingAssetType = "stock" | "bond" | "fund" | "cd" | "other";

export interface L0TopHolding {
  name: string;
  code?: string;
  asset_type: HoldingAssetType;
  weight_pct?: number;
  market_value?: number;
}

export interface L0DividendRecord {
  ex_date: string;
  amount_per_share?: number;
  pay_date?: string;
}

export interface L0FundManagerRecord {
  name: string;
  begin_date?: string;
  end_date?: string;
}

export interface L0FundShareSnapshot {
  /** 基金份额（万）· fund_share.fd_share */
  fd_share?: number;
  trade_date?: string;
  /** 估算规模（亿元）= fd_share × 10000 × nav / 1e8 */
  aum_yi?: number;
}

/** 雪球基金交易规则（id45 fund_individual_detail_info_xq） */
export interface FundFeeRule {
  /** 费用类型：买入规则 / 卖出规则 / 其他费用 */
  kind: string;
  /** 条件或名称（如 "0.0天<持有期限<7.0天"、"基金管理费"） */
  condition: string;
  /** 费率（%） */
  fee: number;
}

/** 天天基金网-行业配置（id48 fund_portfolio_industry_allocation_em） */
export interface FundIndustryAllocation {
  /** 行业类别（如 "制造业"、"金融业"） */
  industry: string;
  /** 占净值比例（%） */
  pct: number;
  /** 市值（万元） */
  market_value?: number;
  /** 截止时间（如 "2023-09-30"） */
  as_of?: string;
}

export interface L0FundSnapshot {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  risk_level?: string;
  is_qdii?: boolean;
  is_index?: boolean;
  lookup_source: LookupSource;
  l0_degraded?: boolean;
  metrics?: L0NavMetrics;
  top_holdings?: L0TopHolding[];
  top_holdings_concentration?: number;
  holdings_as_of?: string;
  /** 持仓数据来源（合并 registry 补全后） */
  holdings_source?: "live" | "registry_demo";
  dividend_history?: L0DividendRecord[];
  fund_managers?: L0FundManagerRecord[];
  fund_share?: L0FundShareSnapshot;
  /** 业绩比较基准全称 · fund_benchmark（须在 index_basic 中可匹配才写入） */
  benchmark_name?: string;
  /** 映射后的指数 ts_code · 供 index_daily */
  benchmark_index_code?: string;
  /** 基金成立日期 · fund_basic.found_date */
  found_date?: string;
  /** 最低申购金额（万元）· fund_basic.min_amount */
  min_amount?: number;
  /** 预期收益率 · fund_basic.exp_return */
  exp_return?: number;
  /** 投资风格（独立字段，不参与 fund_type 拼接）· fund_basic.invest_type */
  invest_type?: string;
  /** 基金类型标签（独立字段，不参与 fund_type 拼接）· fund_basic.type */
  type_label?: string;
  /** 基金管理人 · fund_basic.management */
  management?: string;
  /** 基金托管人 */
  custodian?: string;
  /** 近一年基准涨幅 · index_daily 同 fund_nav 区间 */
  benchmark_return_1y_pct?: number;
  /** 本基金近一年 − 基准近一年 · 两者皆有才算 */
  excess_return_1y_pct?: number;
  /** L0 fund_basic 解析出的费率（管理费为主） */
  fee_rates?: import("@/lib/kb/disclosure-parse").ParsedFeeRates;
  /** AKShare/雪球 · 大类资产比例（季报缺失时 ASSET-01 备用） */
  asset_allocation?: import("@/lib/l0/registry-portfolio").L0AssetAllocation;
  /** 雪球基金交易规则（赎回费等） · fund_individual_detail_info_xq */
  fee_rules_xq?: FundFeeRule[];
  /** 天天基金网-行业配置 · fund_portfolio_industry_allocation_em */
  industry_allocation?: FundIndustryAllocation[];
}

export interface DataSourceSettings {
  tushare_token: string | null;
  tushare_token_masked: string | null;
  tushare_check_status: CheckStatus;
  tushare_last_checked_at: string | null;
  tushare_last_error_message: string | null;
  akshare_check_status: CheckStatus;
  akshare_last_checked_at: string | null;
  akshare_last_error_message: string | null;
  updated_at: string | null;
}
