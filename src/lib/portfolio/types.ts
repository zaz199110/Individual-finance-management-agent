export interface HoldingsPosition {
  fund_code: string;
  fund_name?: string;
  invested_at: string;
  paid_amount: number;
  shares: number;
  source?: string;
  status?: string;
  market_value?: number;
  cash_dividend_total?: number;
  action?: "add" | "remove" | "cash_dividend" | "reinvest_dividend" | "force_adjust";
  dividend_date?: string;
  reinvested_shares?: number;
  dividend_amount?: number;
}

/** action 枚举 → 中文显示标签 */
export const ACTION_LABELS: Record<NonNullable<HoldingsPosition["action"]> | string, string> = {
  add: "买入",
  remove: "卖出",
  cash_dividend: "现金分红",
  reinvest_dividend: "红利再投",
  force_adjust: "强增",
};

export function actionLabel(action?: string): string {
  return ACTION_LABELS[action ?? "add"] ?? action ?? "买入";
}

export interface HoldingsChangeSummary {
  kind: "initial" | "update";
  narrative: string;
  user_quote?: string;
  source?: string;
  items?: Array<Record<string, unknown>>;
}

export interface HoldingsProposePayload {
  kind: "holdings";
  source?: string;
  previous_version_id?: string | null;
  change_summary: HoldingsChangeSummary;
  positions: HoldingsPosition[];
  card_title?: string;
}

export interface HoldingsReadResult {
  has_current: boolean;
  holdings_version_id: string | null;
  position_count: number;
  confirmed_at: string | null;
  total_cost: number;
  positions_summary: string;
  summary: string;
  positions?: HoldingsPosition[];
}
