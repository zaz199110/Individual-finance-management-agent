import {
  verifyProfileReportDraft,
  type ProfileReportVerifyResult,
} from "./profile_report_verify";
import {
  verifyPlanReportDraft,
  type PlanReportVerifyResult,
} from "./plan_report_verify";
import {
  verifyPortfolioReportDraft,
  type PortfolioReportVerifyResult,
} from "./portfolio_report_verify";

export type ReportVerifyResult =
  | ProfileReportVerifyResult
  | PlanReportVerifyResult
  | PortfolioReportVerifyResult;

/**
 * D4: 通用报告验证工具（profile / plan / portfolio）
 * 统一入口，根据 report_type 分发到对应验证器
 */
export async function runReportVerify(
  input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: ReportVerifyResult;
  error?: string;
}> {
  const draftPath = String(input.draft_path ?? "").trim();
  const reportType = String(input.report_type ?? "").trim();

  if (!draftPath) {
    return { ok: false, preview: "", error: "缺少 draft_path。" };
  }
  if (!reportType) {
    return { ok: false, preview: "", error: "缺少 report_type。" };
  }

  let result: ReportVerifyResult;

  switch (reportType) {
    case "profile": {
      result = verifyProfileReportDraft({
        draftPath,
        goalConstraintId: input.goal_constraint_id
          ? String(input.goal_constraint_id)
          : undefined,
      });
      break;
    }
    case "plan": {
      result = verifyPlanReportDraft({
        draftPath,
        goalConstraintId: input.goal_constraint_id
          ? String(input.goal_constraint_id)
          : undefined,
      });
      break;
    }
    case "portfolio": {
      result = verifyPortfolioReportDraft({
        draftPath,
        holdingsVersionId: input.holdings_version_id
          ? String(input.holdings_version_id)
          : undefined,
      });
      break;
    }
    default:
      return {
        ok: false,
        preview: "",
        error: `不支持的报告类型「${reportType}」，仅支持 profile / plan / portfolio。`,
      };
  }

  if (!result.ok) {
    return {
      ok: false,
      preview: result.errors.join("；"),
      data: result,
      error: result.errors[0],
    };
  }

  const warn =
    result.warnings.length > 0 ? `\n提示：${result.warnings.join("；")}` : "";
  return {
    ok: true,
    preview: `Report Verify 通过（${result.echarts_count} 张图）。${warn}`,
    data: result,
  };
}
