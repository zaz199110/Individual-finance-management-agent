import { getSupabase } from "@/lib/supabase/server";
import { publishFundReport } from "@/lib/fund/report-publish";
import { publishPlanReport } from "@/lib/plan/report-publish";
import { publishPortfolioReport } from "@/lib/portfolio/report-publish";
import { publishProfileReport } from "@/lib/profile/report-publish";
import {
  clearReportOverlay,
  mergeReportOverlayIntoDraft,
} from "@/lib/reports/overlay";

async function resolveRunId(
  conversationId: string,
  runId?: string,
): Promise<string | undefined> {
  if (runId) return runId;
  const supabase = await getSupabase();
  if (!supabase) return undefined;
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();
  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
  const draft = meta.pending_report_draft as { run_id?: string } | undefined;
  return draft?.run_id;
}

async function prePublishMerge(
  conversationId: string,
  runId: string | undefined,
  draftPath: string | undefined,
): Promise<{ ok: boolean; draftPath?: string; error?: string }> {
  if (!draftPath || !runId) {
    return { ok: true, draftPath };
  }
  const merged = await mergeReportOverlayIntoDraft({
    conversationId,
    runId,
    draftPath,
  });
  if (!merged.ok) {
    return { ok: false, error: merged.error };
  }
  return { ok: true, draftPath: merged.merged_path ?? draftPath };
}

export async function runReportPublish(
  input: Record<string, unknown>,
  ctx: { conversationId: string; runId?: string },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const reportType = String(input.report_type ?? "profile");
  const supabase = await getSupabase();
  const runId =
    ctx.runId ??
    (typeof input.run_id === "string" ? input.run_id : undefined) ??
    (await resolveRunId(ctx.conversationId));
  let draftPath =
    typeof input.draft_path === "string" ? input.draft_path : undefined;

  const merged = await prePublishMerge(ctx.conversationId, runId, draftPath);
  if (!merged.ok) {
    return { ok: false, preview: "", error: merged.error };
  }
  draftPath = merged.draftPath;

  if (reportType === "portfolio") {
    const holdingsVersionId = String(input.holdings_version_id ?? "");
    if (!holdingsVersionId) {
      return { ok: false, preview: "", error: "缺少 holdings_version_id。" };
    }
    const result = await publishPortfolioReport(supabase, {
      conversationId: ctx.conversationId,
      holdingsVersionId,
      draftPath,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    await clearReportOverlay(ctx.conversationId);
    return {
      ok: true,
      preview: `《持仓分析报告》已确认发布（report_id=${result.report_id}）。`,
      data: result,
    };
  }

  if (reportType === "fund") {
    const fundCode = String(input.fund_code ?? "");
    if (!fundCode) {
      return { ok: false, preview: "", error: "缺少 fund_code。" };
    }
    const result = await publishFundReport(supabase, {
      conversationId: ctx.conversationId,
      fundCode,
      draftPath,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    await clearReportOverlay(ctx.conversationId);
    return {
      ok: true,
      preview: `《基金解读报告》已确认发布（report_id=${result.report_id}）。`,
      data: result,
    };
  }

  const goalConstraintId = String(input.goal_constraint_id ?? "");
  if (reportType === "plan") {
    if (!goalConstraintId) {
      return { ok: false, preview: "", error: "缺少 goal_constraint_id。" };
    }
    const result = await publishPlanReport(supabase, {
      conversationId: ctx.conversationId,
      goalConstraintId,
      draftPath,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    await clearReportOverlay(ctx.conversationId);
    return {
      ok: true,
      preview: `《投资规划书》已确认发布（report_id=${result.report_id}）。`,
      data: result,
    };
  }

  if (!goalConstraintId) {
    return { ok: false, preview: "", error: "缺少 goal_constraint_id。" };
  }

  const result = await publishProfileReport(supabase, {
    conversationId: ctx.conversationId,
    goalConstraintId,
    draftPath,
  });

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  await clearReportOverlay(ctx.conversationId);

  return {
    ok: true,
    preview: `《投资需求报告》已确认发布（report_id=${result.report_id}）。`,
    data: result,
  };
}
