export interface TargetAllocationCategory {
  category: string;
  allocation_pct: number;
  amount_cny?: number;
}

export interface PlanAllocationPayload {
  kind: "plan_allocation";
  goal_constraint_id: string;
  goal_display_name?: string;
  profile_version_id?: string;
  target_allocation: {
    total_amount_cny?: number;
    categories: TargetAllocationCategory[];
  };
  allocation_rationale: string;
  allocation_citations?: Array<{ title: string; url: string; snippet?: string }>;
  card_title?: string;
}

export interface PlanDetailFundItem {
  fund_code: string;
  fund_name: string;
  weight_in_category?: number;
  allocation_pct_of_portfolio: number;
  recommendation_reason?: string;
  role_label?: string;
}

export interface PlanDetailCategory {
  category: string;
  allocation_pct: number;
  items: PlanDetailFundItem[];
  structure_note?: string;
}

export interface PlanDetailPayload {
  kind: "plan_detail";
  goal_constraint_id: string;
  goal_display_name?: string;
  profile_version_id?: string;
  target_allocation_summary?: Record<string, number>;
  detailed_plan: {
    categories: PlanDetailCategory[];
  };
  execution_schedule?: Record<string, unknown>;
  web_citations?: Array<{ title: string; url: string; snippet?: string }>;
  card_title?: string;
}

export interface PlanReadResult {
  n: number;
  eligible_groups: Array<{
    goal_constraint_id: string;
    goal_type: string;
    display_name: string;
  }>;
  goal_constraint_id: string | null;
  has_step1: boolean;
  has_step2_current: boolean;
  current_plan_id: string | null;
  summary: string;
}
