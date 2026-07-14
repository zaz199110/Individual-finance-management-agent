import { NextRequest, NextResponse } from "next/server";
import { planRead } from "@/lib/plan/read";
import { getSupabase } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const goalConstraintId =
    request.nextUrl.searchParams.get("goal_constraint_id") ?? undefined;

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  const plan = await planRead(supabase, goalConstraintId);
  if (!plan.goal_constraint_id || plan.n === 0) {
    return NextResponse.json({
      has_data: false,
      reason: plan.n === 0
        ? "尚未完善个人画像信息"
        : "暂无资产配置数据",
      has_profile: plan.n > 0,
      has_step1: false,
    });
  }

  const goalId = plan.goal_constraint_id;

  // Fetch goal (scenario name, type, amounts)
  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select(
      "display_name, goal_type, principal_amount, monthly_amount, investment_constraints",
    )
    .eq("id", goalId)
    .maybeSingle();

  if (!goal) {
    return NextResponse.json({
      has_data: false,
      reason: "未找到投资需求记录",
      has_profile: true,
      has_step1: plan.has_step1,
    });
  }

  // 并行查询：步骤1（大类资产配置）与 步骤2（基金明细），各自独立
  // 注意：allocation_plans 表无 investment_constraints 列，该字段来自 investment_goal_constraints
  const [step2Result, step1Result] = await Promise.all([
    supabase
      .from("allocation_plans")
      .select("target_allocation, allocation_rationale, detailed_plan")
      .eq("goal_constraint_id", goalId)
      .eq("plan_step", 2)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("allocation_plans")
      .select("target_allocation, allocation_rationale")
      .eq("goal_constraint_id", goalId)
      .eq("plan_step", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const step2Plan = step2Result.data ?? null;
  const step1Plan = step1Result.data ?? null;

  // 始终使用 step1 的 target_allocation 作为权威来源，
  // 因为用户编辑大类配置时只更新 step1，step2 中的副本可能已过时
  const targetAllocation =
    (step1Plan?.target_allocation as Record<string, unknown> | null) ??
    (step2Plan?.target_allocation as Record<string, unknown> | null) ??
    null;
  const allocationRationale =
    (step1Plan?.allocation_rationale as string | null) ??
    (step2Plan?.allocation_rationale as string | null) ??
    null;
  const detailedPlan =
    (step2Plan?.detailed_plan as Record<string, unknown> | null) ?? null;
  // investment_constraints 存储在 investment_goal_constraints 表，不在 allocation_plans
  const investmentConstraints =
    (goal.investment_constraints as Record<string, unknown> | null) ?? null;

  if (!targetAllocation && !detailedPlan) {
    return NextResponse.json({
      has_data: false,
      reason: "当前场景暂无活跃配置方案",
      goal_constraint_id: goalId,
      has_profile: true,
      has_step1: plan.has_step1,
      has_step2_current: plan.has_step2_current,
    });
  }

  return NextResponse.json({
    has_data: true,
    has_profile: true,
    has_step1: plan.has_step1,
    has_step2_current: plan.has_step2_current,
    conversation_id: conversationId,
    goal_constraint_id: goalId,
    scenario_name: goal.display_name ?? goalId,
    goal_type: goal.goal_type ?? null,
    principal_amount: (goal.principal_amount as number) ?? 0,
    monthly_amount: (goal.monthly_amount as number) ?? 0,
    target_allocation: targetAllocation,
    allocation_rationale: allocationRationale,
    detailed_plan: detailedPlan,
    investment_constraints: investmentConstraints,
  });
}
