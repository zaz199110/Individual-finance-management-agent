import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeConstraintKeys } from "./constraint-utils";
import { verifyProfileReportDraft } from "@/harness/tools/profile_report_verify";
import { validateBasicInfo } from "./basic-info";
import { validateGoalConstraint } from "./goal-constraint";
import { goalDisplayName } from "./goal-labels";
import {
  buildProfileReportMarkdown,
  type ProfileReportComposeInput,
} from "./report-blueprint";
import { refineProfileDraftReport } from "./report-refine";
import { writeDraftMeta } from "@/lib/reports/draft-meta";
import { getDraftReportPath } from "@/lib/reports/draft-path";
import { polishDraftReportFile } from "@/lib/reports/report-polish";
import type { BasicInfo, InvestmentConstraints } from "./types";

/** DB stores old field names; validators / UI expect new canonical names. */
function normalizeBasicInfoKeys(info: Record<string, unknown>): Record<string, unknown> {
  const basicMap: Record<string, string> = {
    children: "has_children",
    annual_income: "annual_income_after_tax",
    monthly_income: "monthly_income_after_tax",
    risk_preference: "risk_tolerance",
    start_date: "start_invest_date",
    total_debt: "loan_balance_total",
    monthly_debt_payment: "monthly_loan_payment",
    monthly_expense: "monthly_fixed_expense",
  };
  const out: Record<string, unknown> = { ...info };
  for (const [oldKey, newKey] of Object.entries(basicMap)) {
    if (out[oldKey] !== undefined && out[newKey] === undefined) {
      out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  return out;
}



export interface ReportDraftResult {
  ok: boolean;
  draft_path?: string;
  report_name?: string;
  preview?: string;
  error?: string;
  echarts_count?: number;
  refined?: boolean;
  refine_ok?: boolean;
  refine_warnings?: string[];
  verify_warnings?: string[];
}

function buildProfileDraftPreview(
  finalMd: string,
  opts?: { refineWarnings?: string[]; verifyWarnings?: string[] },
): string {
  const head: string[] = [];
  if (opts?.refineWarnings?.length) {
    head.push(`**润色提示**：${opts.refineWarnings.join("；")}`);
  }
  if (opts?.verifyWarnings?.length) {
    head.push(`**校验提示**：${opts.verifyWarnings.join("；")}`);
  }
  const body = finalMd.slice(0, 800);
  return head.length ? `${head.join("\n\n")}\n\n${body}` : body;
}

export function formatProfileDraftNotice(input: {
  refineOk: boolean;
  refineError?: string;
  refineWarnings?: string[];
  verifyWarnings?: string[];
}): string | undefined {
  const parts: string[] = [];
  if (!input.refineOk && input.refineError) {
    parts.push(input.refineError);
  }
  if (input.refineWarnings?.length) {
    parts.push(...input.refineWarnings);
  }
  // Verify warnings are internal validation details — suppress from user-facing notice
  return parts.length ? parts.join("；") : undefined;
}

export async function draftProfileReport(
  supabase: SupabaseClient | null,
  params: {
    goalConstraintId: string;
    conversationId: string;
    runId: string;
  },
): Promise<ReportDraftResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
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

  const normalizedBasic = normalizeBasicInfoKeys(
    (profile?.basic_info ?? {}) as Record<string, unknown>,
  );
  const basicValidation = validateBasicInfo(normalizedBasic);
  if (!basicValidation.ok || !basicValidation.data) {
    return {
      ok: false,
      error: `客户信息层不完整：${basicValidation.errors.join(" ")}`,
    };
  }

  // Normalize constraint keys and merge principal/monthly
  const rawConstraints = (
    goal.investment_constraints ?? {}
  ) as Record<string, unknown>;
  if (goal.principal_amount != null && rawConstraints.principal_amount == null) {
    rawConstraints.principal_amount = goal.principal_amount;
  }
  if (goal.monthly_amount != null && rawConstraints.monthly_amount == null) {
    rawConstraints.monthly_amount = goal.monthly_amount;
  }
  const normalizedConstraints = normalizeConstraintKeys(rawConstraints, {
    goalId: goal.id ?? goal.goal_type,
  });

  const goalPayload = validateGoalConstraint({
    kind: "goal_constraint",
    goal_type: goal.goal_type,
    goal_detail: goal.goal_detail,
    investment_constraints: normalizedConstraints,
    principal_amount: goal.principal_amount,
    monthly_amount: goal.monthly_amount,
    goal_display_name: goal.display_name,
    profile_version_id: goal.profile_version_id,
  });
  if (!goalPayload.ok || !goalPayload.data) {
    return {
      ok: false,
      error: `投资需求组数据无效：${goalPayload.errors.join(" ")}`,
    };
  }

  const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const reportName = `${sceneName}-投资需求-${ymd}`;

  const composeInput: ProfileReportComposeInput = {
    sceneName,
    goalType: goal.goal_type,
    dateLabel,
    ymd,
    basicInfo: basicValidation.data as BasicInfo,
    constraints: goalPayload.data.investment_constraints as InvestmentConstraints,
    principalAmount: (goalPayload.data.investment_constraints as unknown as Record<string, unknown>).principal_amount as number,
    monthlyAmount: (goalPayload.data.investment_constraints as unknown as Record<string, unknown>).monthly_amount as number,
  };

  const composed = buildProfileReportMarkdown(composeInput);
  const filePath = getDraftReportPath(params.conversationId, params.runId);
  fs.writeFileSync(filePath, composed.markdown, "utf8");
  polishDraftReportFile(filePath);

  const refine = await refineProfileDraftReport({
    draftPath: filePath,
    sceneName,
    relativeMetrics: composed.relativeMetrics,
    understandingDraft: composed.understandingDraft,
  });

  const refineWarnings = refine.quality_warnings ?? [];
  const refineNotice =
    !refine.ok && refine.error
      ? refine.error
      : refineWarnings.length
        ? refineWarnings.join("；")
        : undefined;

  writeDraftMeta(filePath, {
    report_type: "profile",
    conversation_id: params.conversationId,
    run_id: params.runId,
    report_name: reportName,
    goal_constraint_id: params.goalConstraintId,
    profile_version_id: goal.profile_version_id,
    goal_type: goal.goal_type,
    goal_detail: goalPayload.data.goal_detail,
    echarts_count: composed.echartsCount,
    refine: {
      ok: refine.ok,
      refined: refine.refined,
      skipped: refine.skipped ?? false,
      skip_reason: refine.skip_reason ?? null,
      sections_fixed: refine.sections_fixed ?? [],
      quality_warnings: refineWarnings,
      error: refine.error ?? null,
    },
  });

  const verify = verifyProfileReportDraft({
    draftPath: filePath,
    goalConstraintId: params.goalConstraintId,
  });

  writeDraftMeta(filePath, {
    verify: {
      ok: verify.ok,
      errors: verify.errors,
      warnings: verify.warnings,
      echarts_count: verify.echarts_count,
    },
  });

  if (!verify.ok) {
    const verifyMsg = verify.errors.join("；");
    const extra =
      !refine.ok && refine.error && !verifyMsg.includes(refine.error)
        ? `${refine.error}；${verifyMsg}`
        : verifyMsg;
    return {
      ok: false,
      draft_path: filePath,
      report_name: reportName,
      error: `报告结构校验未通过：${extra}`,
      echarts_count: composed.echartsCount,
      refined: refine.refined,
      refine_ok: refine.ok,
      refine_warnings: refineWarnings.length ? refineWarnings : undefined,
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
            report_type: "profile",
            goal_constraint_id: params.goalConstraintId,
            file_path: filePath,
            report_name: reportName,
            run_id: params.runId,
            notice_zh: refineNotice ?? undefined,
          },
          has_unconfirmed: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.conversationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[draftProfileReport] 会话元数据更新失败: ${msg}`);
    return {
      ok: false,
      error: `报告草稿已写入，但会话元数据更新失败：${msg}`,
      draft_path: filePath,
      report_name: reportName,
      echarts_count: composed.echartsCount,
      refined: refine.refined,
      refine_ok: refine.ok,
      refine_warnings: refineWarnings.length ? refineWarnings : undefined,
    };
  }

  const finalMd = fs.readFileSync(filePath, "utf8");
  const verifyWarnings = verify.warnings.length ? verify.warnings : undefined;

  return {
    ok: true,
    draft_path: filePath,
    report_name: reportName,
    preview: buildProfileDraftPreview(finalMd, {
      refineWarnings,
      verifyWarnings,
    }),
    echarts_count: composed.echartsCount,
    refined: refine.refined,
    refine_ok: refine.ok,
    refine_warnings: refineWarnings.length ? refineWarnings : undefined,
    verify_warnings: verifyWarnings,
  };
}
