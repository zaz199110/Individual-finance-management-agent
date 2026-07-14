import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPlanReportDraft } from "@/harness/tools/plan_report_verify";
import { completeText } from "@/lib/llm/invoke";
import { validateBasicInfo } from "@/lib/profile/basic-info";
import { goalDisplayName } from "@/lib/profile/goal-labels";
import { validateGoalConstraint } from "@/lib/profile/goal-constraint";
import type { BasicInfo, InvestmentConstraints } from "@/lib/profile/types";
import { writeDraftMeta } from "@/lib/reports/draft-meta";
import { getDraftReportPath } from "@/lib/reports/draft-path";
import { polishDraftReportFile } from "@/lib/reports/report-polish";
import { ensureModelSlot } from "@/lib/supabase/server";
import { buildExecutionSchedule } from "./execution-schedule";
import {
  buildPlanReportMarkdown,
  type PlanDetailCategory,
} from "./plan-report-blueprint";
import { refinePlanDraftReport } from "./plan-report-refine";
import { deriveRiskMetricsFromIndices, fetchCategoryIndexMetrics } from "./risk-index";
import type { TargetAllocationCategory } from "./types";

export interface PlanReportDraftResult {
  ok: boolean;
  draft_path?: string;
  report_name?: string;
  preview?: string;
  error?: string;
  echarts_count?: number;
  refined?: boolean;
}

export async function draftPlanReport(
  supabase: SupabaseClient | null,
  params: {
    goalConstraintId: string;
    conversationId: string;
    runId: string;
  },
): Promise<PlanReportDraftResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const { data: plan } = await supabase
    .from("allocation_plans")
    .select(
      "id, detailed_plan, allocation_rationale, web_citations",
    )
    .eq("goal_constraint_id", params.goalConstraintId)
    .eq("plan_step", 2)
    .eq("is_current", true)
    .maybeSingle();

  // 大类配置以 step1 为准，step2 不再存储 target_allocation 副本
  const { data: step1Plan } = await supabase
    .from("allocation_plans")
    .select("target_allocation, allocation_rationale")
    .eq("goal_constraint_id", params.goalConstraintId)
    .eq("plan_step", 1)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return { ok: false, error: "请先确认基金明细方案（第二步）后再生成规划书。" };
  }

  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select(
      "id, goal_type, display_name, profile_version_id, goal_detail, investment_constraints, principal_amount, monthly_amount",
    )
    .eq("id", params.goalConstraintId)
    .maybeSingle();

  if (!goal) {
    return { ok: false, error: "未找到该投资需求组。" };
  }

  const { data: profile } = await supabase
    .from("profile_versions")
    .select("basic_info")
    .eq("id", goal.profile_version_id)
    .maybeSingle();

  const basicValidation = validateBasicInfo(profile?.basic_info ?? {});
  const basicInfo = (basicValidation.data ?? {}) as BasicInfo;

  const goalPayload = validateGoalConstraint({
    kind: "goal_constraint",
    goal_type: goal.goal_type,
    goal_detail: goal.goal_detail,
    investment_constraints: goal.investment_constraints,
    principal_amount: goal.principal_amount,
    monthly_amount: goal.monthly_amount,
    goal_display_name: goal.display_name,
    profile_version_id: goal.profile_version_id,
  });

  const { data: profileReports } = await supabase
    .from("report_index")
    .select("id")
    .eq("report_type", "profile")
    .eq("goal_constraint_id", params.goalConstraintId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const asOf = new Date(today.getTime() - 86400000);
  const asOfDate = `${asOf.getFullYear()}年${asOf.getMonth() + 1}月${asOf.getDate()}日`;
  const reportName = `${sceneName}-资产配置方案-${ymd}`;

  const targetAllocation = (step1Plan?.target_allocation ?? {
    categories: [],
  }) as { total_amount_cny?: number; categories: TargetAllocationCategory[] };

  const detailedPlan = (plan.detailed_plan ?? { categories: [] }) as {
    categories: PlanDetailCategory[];
  };

  const constraints = (goalPayload.data?.investment_constraints ??
    goal.investment_constraints) as InvestmentConstraints;

  const indexMetrics = await fetchCategoryIndexMetrics();
  const weights = {
    股票类: targetAllocation.categories.find((c) => c.category === "股票类")?.allocation_pct ?? 0,
    债券类: targetAllocation.categories.find((c) => c.category === "债券类")?.allocation_pct ?? 0,
    货币类: targetAllocation.categories.find((c) => c.category === "货币类")?.allocation_pct ?? 0,
  };

  const hasQdii = detailedPlan.categories.some((c) =>
    c.items.some((i) => /QDII|海外|标普/.test(i.fund_name)),
  );

  const riskMetrics = deriveRiskMetricsFromIndices({
    weights,
    indexMetrics,
    goalType: goal.goal_type,
    hasQdii,
  });

  const webCitations = (plan.web_citations ?? []) as Array<{ title: string; url?: string }>;

  const executionSchedule = buildExecutionSchedule({
    categories: detailedPlan.categories,
    principalAmount: goal.principal_amount,
    monthlyAmount: goal.monthly_amount,
    deployMode: String((constraints as unknown as Record<string, unknown>).deploy_mode ?? ""),
  });

  const composed = buildPlanReportMarkdown({
    sceneName,
    goalType: goal.goal_type,
    ymd,
    dateLabel,
    asOfDate,
    basicInfo,
    constraints,
    principalAmount: goal.principal_amount,
    monthlyAmount: goal.monthly_amount,
    profileReportId: profileReports?.[0]?.id as string | undefined,
    targetAllocation,
    allocationRationale: String(step1Plan?.allocation_rationale ?? plan.allocation_rationale ?? ""),
    detailedPlan,
    executionSchedule: executionSchedule as unknown as Record<string, unknown>,
    webCitations,
    riskMetrics,
  });

  const filePath = getDraftReportPath(params.conversationId, params.runId);
  fs.writeFileSync(filePath, composed.markdown, "utf8");
  polishDraftReportFile(filePath);

  const refine = await refinePlanDraftReport({
    draftPath: filePath,
    section3Draft: composed.section3Draft,
    webCitationsSummary: webCitations.map((c) => c.title).join("；"),
    allocationRationale: String(step1Plan?.allocation_rationale ?? plan.allocation_rationale ?? ""),
  });

  writeDraftMeta(filePath, {
    report_type: "plan",
    conversation_id: params.conversationId,
    run_id: params.runId,
    report_name: reportName,
    goal_constraint_id: params.goalConstraintId,
    allocation_plan_id: plan.id,
    echarts_count: composed.echartsCount,
    refine: { ok: refine.ok, refined: refine.refined, skipped: refine.skipped ?? false },
  });

  const verify = verifyPlanReportDraft({
    draftPath: filePath,
    goalConstraintId: params.goalConstraintId,
  });

  if (!verify.ok) {
    return {
      ok: false,
      draft_path: filePath,
      report_name: reportName,
      error: `报告结构校验未通过：${verify.errors.join("；")}`,
      echarts_count: composed.echartsCount,
    };
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", params.conversationId)
    .maybeSingle();

  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;

  try {
    await supabase
      .from("conversations")
      .update({
        metadata: {
          ...meta,
          pending_report_draft: {
            report_type: "plan",
            goal_constraint_id: params.goalConstraintId,
            allocation_plan_id: plan.id,
            file_path: filePath,
            report_name: reportName,
            run_id: params.runId,
          },
          has_unconfirmed: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.conversationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[draftPlanReport] 会话元数据更新失败: ${msg}`);
    return {
      ok: false,
      error: `报告草稿已写入，但会话元数据更新失败：${msg}`,
      draft_path: filePath,
      report_name: reportName,
      echarts_count: composed.echartsCount,
      refined: refine.refined,
    };
  }

  const finalMd = fs.readFileSync(filePath, "utf8");

  return {
    ok: true,
    draft_path: filePath,
    report_name: reportName,
    preview: finalMd.slice(0, 800),
    echarts_count: composed.echartsCount,
    refined: refine.refined,
  };
}
