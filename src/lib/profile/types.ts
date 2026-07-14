export interface BasicInfo {
  name: string;
  age: number;
  gender: string;
  marital_status: string;
  has_children: string;
  occupation: string;
  investment_experience: string;
  annual_income_after_tax: number;
  monthly_income_after_tax: number;
  financial_assets: number;
  loan_balance_total: number;
  monthly_loan_payment: number;
  monthly_fixed_expense: number;
  monthly_investable: number;
}

export interface ProfileGroupSummary {
  goal_constraint_id: string;
  goal_type: string;
  display_name: string;
}

export interface ProfileReadResult {
  profile_version_id: string | null;
  has_basic_info: boolean;
  basic_info_summary: string | null;
  eligible_groups: ProfileGroupSummary[];
  incomplete_groups: ProfileGroupSummary[];
  active_constraint_count: number;
}

// ── InvestmentConstraints (discriminated union per goal_type) ──

export interface InvestmentConstraintsBase {
  risk_tolerance: string;
  principal_amount: number;
  monthly_amount: number;
  dca_completion_months: string; // e.g. "12月"
  target_return: number; // e.g. 8 = 8% annualized
  max_drawdown: string;
}

export interface MarriageChildConstraints extends InvestmentConstraintsBase {
  goal_type: "marriage_child";
  start_invest_date: string; // YYYY-MM-DD
  money_needed_date: string; // YYYY-MM-DD
  target_amount: number;
}

export interface WealthGrowthConstraints extends InvestmentConstraintsBase {
  goal_type: "wealth_growth";
  investment_duration: string; // e.g. "3-5年"
}

export interface RetirementConstraints extends InvestmentConstraintsBase {
  goal_type: "retirement";
  start_invest_date: string; // YYYY-MM-DD 计划开始日期
  money_needed_date: string; // YYYY-MM-DD 资金需求日期
  monthly_retirement_spending: number;
}

export interface EducationConstraints extends InvestmentConstraintsBase {
  goal_type: "education";
  start_invest_date: string; // YYYY-MM-DD
  money_needed_date: string; // YYYY-MM-DD
}

export interface HousingConstraints extends InvestmentConstraintsBase {
  goal_type: "housing";
  start_invest_date: string; // YYYY-MM-DD
  money_needed_date: string; // YYYY-MM-DD
}

export type InvestmentConstraints =
  | MarriageChildConstraints
  | WealthGrowthConstraints
  | RetirementConstraints
  | EducationConstraints
  | HousingConstraints;

export interface GoalConstraintProposePayload {
  kind: "goal_constraint";
  goal_constraint_id?: string | null;
  goal_type: string; // kept as top-level convenience (also present inside InvestmentConstraints union)
  goal_display_name?: string;
  profile_version_id?: string;
  goal_detail: Record<string, unknown>;
  investment_constraints: InvestmentConstraints;
  card_title?: string;
}

export interface ProfileBasicProposePayload {
  kind: "profile_basic";
  card_title?: string;
  basic_info: BasicInfo;
  formula_hint?: string;
}

export interface ReportPublishCardBlock {
  type: "report_publish_card";
  status: "active" | "published" | "dismissed";
  report_type: "profile" | "plan" | "portfolio" | "fund";
  goal_constraint_id?: string;
  holdings_version_id?: string;
  fund_code?: string;
  scope?: string;
  report_name: string;
  file_path?: string;
  /** 润色/校验非阻断提示（C 端展示） */
  notice_zh?: string;
}

export interface ConfirmCardBlock {
  type: "confirm_card";
  status: "active" | "confirmed" | "dismissed" | "superseded";
  artifact_id: string;
  card_kind: "profile_basic" | "goal_constraint" | "plan_allocation" | "plan_detail" | "holdings" | "report_publish";
  summary_zh: string;
  card_title?: string;
}
