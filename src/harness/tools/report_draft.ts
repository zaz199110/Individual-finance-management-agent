import { getSupabase } from "@/lib/supabase/server";
import { draftFundReport } from "@/lib/fund/report-draft";
import { draftPlanReport } from "@/lib/plan/report-draft";
import { draftPortfolioReport } from "@/lib/portfolio/report-draft";
import { draftProfileReport } from "@/lib/profile/report-draft";
import { mergeReportOverlayIntoDraft } from "@/lib/reports/overlay";
import { polishDraftReportFile } from "@/lib/reports/report-polish";
import {
  reviewAndRefineFundDraft,
  type FundDraftRefineResult,
} from "@/lib/reports/report-fund-refine";
import { synopsisInputFromLookup } from "@/lib/fund/fund-report-synopsis";
import { writeDraftMeta } from "@/lib/reports/draft-meta";
import { fundLookupAsync } from "@/lib/fund/lookup";

async function finalizeDraftWithOverlay(
  ctx: { conversationId: string; runId: string },
  draftPath: string | undefined,
  fundMeta?: {
    fundCode: string;
    fundName: string;
    fundType: string;
    hasVault: boolean;
    holdingsSource?: "live" | "registry_demo";
    synopsisInput?: import("@/lib/fund/fund-report-synopsis").FundSynopsisInput;
  },
): Promise<FundDraftRefineResult | undefined> {
  if (!draftPath) return undefined;
  await mergeReportOverlayIntoDraft({
    conversationId: ctx.conversationId,
    runId: ctx.runId,
    draftPath,
  });
  polishDraftReportFile(draftPath);
  if (!fundMeta) return undefined;

  const refine = await reviewAndRefineFundDraft({
    draftPath,
    fundCode: fundMeta.fundCode,
    fundName: fundMeta.fundName,
    fundType: fundMeta.fundType,
    hasVault: fundMeta.hasVault,
    holdingsSource: fundMeta.holdingsSource,
    synopsisInput: fundMeta.synopsisInput,
  });

  writeDraftMeta(draftPath, {
    refine: {
      refined: refine.refined,
      skipped: refine.skipped ?? false,
      skip_reason: refine.skip_reason ?? null,
      sections_fixed: refine.sections_fixed ?? [],
    },
  });

  return refine;
}

export async function runReportDraft(
  input: Record<string, unknown>,
  ctx: {
    conversationId: string;
    runId: string;
    onGatherStage?: import("@/harness/infra/fund_knowledge/waterfall").GatherStageHook;
    onGatherComplete?: () => void | Promise<void>;
  },
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const reportType = String(input.report_type ?? "profile");
  const goalConstraintId =
    typeof input.goal_constraint_id === "string"
      ? input.goal_constraint_id
      : undefined;
  const supabase = await getSupabase();

  if (reportType === "portfolio") {
    const result = await draftPortfolioReport(supabase, {
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      holdingsVersionId:
        typeof input.holdings_version_id === "string"
          ? input.holdings_version_id
          : undefined,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    await finalizeDraftWithOverlay(ctx, result.draft_path);
    return {
      ok: true,
      preview: result.preview ?? `报告草稿：${result.report_name}`,
      data: result,
    };
  }

  if (reportType === "fund") {
    const fundCode = String(input.fund_code ?? "");
    if (!fundCode) {
      return { ok: false, preview: "", error: "缺少 fund_code。" };
    }
    const result = await draftFundReport(supabase, {
      fundCode,
      conversationId: ctx.conversationId,
      runId: ctx.runId,
      onGatherStage: ctx.onGatherStage,
      onGatherComplete: ctx.onGatherComplete,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    const lookup = await fundLookupAsync({ fund_code: fundCode });
    await finalizeDraftWithOverlay(ctx, result.draft_path, {
      fundCode,
      fundName: lookup.fund_name ?? fundCode,
      fundType: lookup.fund_type ?? "—",
      hasVault: Boolean(lookup.has_vault),
      holdingsSource: lookup.holdings_source,
      synopsisInput: synopsisInputFromLookup(lookup, {
        investmentObjectiveExcerpt: result.objectiveExcerpt,
      }),
    });
    return {
      ok: true,
      preview: result.preview ?? `报告草稿：${result.report_name}`,
      data: result,
    };
  }
  if (reportType === "plan") {
    if (!goalConstraintId) {
      return { ok: false, preview: "", error: "缺少 goal_constraint_id。" };
    }
    const result = await draftPlanReport(supabase, {
      goalConstraintId,
      conversationId: ctx.conversationId,
      runId: ctx.runId,
    });
    if (!result.ok) {
      return { ok: false, preview: "", error: result.error };
    }
    await finalizeDraftWithOverlay(ctx, result.draft_path);
    return {
      ok: true,
      preview: result.preview ?? `报告草稿：${result.report_name}`,
      data: result,
    };
  }

  if (reportType !== "profile") {
    return {
      ok: false,
      preview: "",
      error: "不支持的 report_type。",
    };
  }

  if (!goalConstraintId) {
    return { ok: false, preview: "", error: "缺少 goal_constraint_id。" };
  }

  const result = await draftProfileReport(supabase, {
    goalConstraintId,
    conversationId: ctx.conversationId,
    runId: ctx.runId,
  });

  if (!result.ok) {
    return { ok: false, preview: "", error: result.error };
  }

  await finalizeDraftWithOverlay(ctx, result.draft_path);

  return {
    ok: true,
    preview: result.preview ?? `报告草稿：${result.report_name}`,
    data: result,
  };
}
