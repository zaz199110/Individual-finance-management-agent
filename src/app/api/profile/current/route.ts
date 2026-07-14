/**
 * GET /api/profile/current
 * 返回当前用户完整的画像数据，包括基本信息（basic_info）与所有活跃的理财目标（goals）。
 */
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import type { BasicInfo } from "@/lib/profile/types";

const GOAL_DISPLAY_NAME_MAP: Record<string, string> = {
  marriage_child: "结婚生育",
  housing: "购房置业",
  education: "子女教育",
  retirement: "退休养老",
  wealth_growth: "财富增值",
};

// ---------------------------------------------------------------------------
// Field-name normalization: DB keys → UI keys
// DB stores legacy field names; frontend reads the new canonical names.
// Normalize at the API boundary so both old and new DB data work correctly.
// ---------------------------------------------------------------------------

const BASIC_INFO_KEY_MAP: Record<string, string> = {
  children: "has_children",
  annual_income: "annual_income_after_tax",
  monthly_income: "monthly_income_after_tax",
  total_debt: "loan_balance_total",
  monthly_debt_payment: "monthly_loan_payment",
  monthly_expense: "monthly_fixed_expense",
};

const CONSTRAINT_KEY_MAP: Record<string, string> = {
  risk_preference: "risk_tolerance",
  target_annual_return: "target_return",
  expected_return: "target_return", // V2 seed field name
  start_date: "start_invest_date",
  target_date: "money_needed_date",
  monthly_retirement_payout: "monthly_retirement_spending",
  investment_horizon_years: "investment_duration",
  investment_horizon: "investment_duration", // V2 seed field name
};

/** Rename keys in an object according to a mapping, keeping original keys as-is when not mapped. */
function normalizeKeys(
  obj: Record<string, unknown>,
  keyMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = keyMap[key] ?? key;
    result[newKey] = value;
  }
  return result;
}

export async function GET() {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "数据库未连接。" },
        { status: 503 },
      );
    }

    // 1. 获取当前画像版本
    const { data: currentProfile } = await supabase
      .from("profile_versions")
      .select("id, basic_info")
      .eq("is_current", true)
      .maybeSingle();

    if (!currentProfile) {
      return NextResponse.json(
        { error: "未找到当前画像版本。" },
        { status: 404 },
      );
    }

    const profile_version_id = currentProfile.id as string;
    const rawBasicInfo = (currentProfile.basic_info as Record<string, unknown>) ?? null;
    const basic_info = rawBasicInfo ? (normalizeKeys(rawBasicInfo, BASIC_INFO_KEY_MAP) as unknown as BasicInfo) : null;

    // 2. 获取当前画像下的活跃目标
    const { data: goalRows } = await supabase
      .from("investment_goal_constraints")
      .select("id, goal_type, goal_detail, investment_constraints, principal_amount, monthly_amount, created_at")
      .eq("profile_version_id", profile_version_id)
      .eq("is_active", true);

    const goals = (goalRows ?? []).map((row: Record<string, unknown>) => {
      const goal_type = row.goal_type as string;
      const constraints = row.investment_constraints as Record<string, unknown>;
      return {
        goal_type,
        goal_display_name:
          GOAL_DISPLAY_NAME_MAP[goal_type] ?? goal_type,
        goal_constraint_id: row.id as string,
        goal_detail: row.goal_detail as Record<string, unknown>,
        investment_constraints: normalizeKeys(
          {
            ...constraints,
            principal_amount: row.principal_amount,
            monthly_amount: row.monthly_amount,
          },
          CONSTRAINT_KEY_MAP,
        ),
        created_at: row.created_at as string,
      };
    });

    return NextResponse.json({ profile_version_id, basic_info, goals });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "获取当前画像数据失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
