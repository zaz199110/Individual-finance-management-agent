import { checkToolPermission } from "@/harness/permission/check";
import type { SceneId } from "@/harness/registry/load";
import { compactCommand } from "./compact";
import { runFundKnowledgeExplore } from "./fund_knowledge_explore";
import { runFundKnowledgeSemanticSearch } from "./fund_knowledge_semantic_search";
import { runFundLookup } from "./fund_lookup";
import { runSeedSync } from "./seed_sync";
import { runHoldingsConfirm } from "./holdings_confirm";
import { runHoldingsPropose } from "./holdings_propose";
import { runHoldingsRead } from "./holdings_read";
import { runHoldingsTextParse } from "./holdings_text_parse";
import { runPlanConfirm } from "./plan_confirm";
import { runPlanCheckCompleteness } from "./plan_check_completeness";
import { runPlanCheckConflicts } from "./plan_check_conflicts";
import { runPlanScreenFunds } from "./plan_screen_funds";
import { runPlanPropose } from "./plan_propose";
import { runPlanRead } from "./plan_read";
import { runProfileConfirm } from "./profile_confirm";
import { runProfileParse } from "./profile_parse";
import { runProfilePropose } from "./profile_propose";
import { runProfileRead } from "./profile_read";
import { runProfileResetGoals } from "./profile_reset_goals";
import { runGoalConstraintParse } from "./goal_constraint_parse";
import { runReportDraft } from "./report_draft";
import { runReportPublish } from "./report_publish";
import { runReportRead } from "./report_read";
import { runReportOverlayPatch } from "./report_overlay_patch";
import { runReportOverlayMerge } from "./report_overlay_merge";
import { runReportVerify } from "./report_verify";
import { runArtifactRead } from "./artifact_read";
import { webSearch } from "./web_search";
import type { WebSearchInput } from "./web_search.types";
import type { GatherStageHook } from "@/harness/infra/fund_knowledge/waterfall";
import { addToWatchlist, removeFromWatchlist } from "@/lib/fund/watchlist";

export interface ToolCallInput {
  tool: string;
  input: Record<string, unknown>;
  scene: SceneId;
  confirmToken?: string;
  conversationId?: string;
  runId?: string;
  hooks?: {
    onGatherStage?: GatherStageHook;
    onGatherComplete?: () => void | Promise<void>;
  };
}

export interface ToolCallResult {
  ok: boolean;
  preview: string;
  data?: unknown;
  citations?: Array<{ title: string; url: string }>;
  error?: string;
}

export async function executeTool(
  call: ToolCallInput,
  compactCtx?: { messages: import("@/harness/types").MessageRow[]; conversationId: string; runId: string },
): Promise<ToolCallResult> {
  const perm = checkToolPermission(call.tool, call.scene, {
    hasConfirmToken: Boolean(call.confirmToken),
  });

  if (perm.permission === "deny") {
    return { ok: false, preview: "", error: perm.reason ?? "工具被拒绝。" };
  }
  if (perm.permission === "needs_confirm") {
    return { ok: false, preview: "", error: perm.reason ?? "需要用户确认。" };
  }

  switch (call.tool) {
    case "web_search": {
      const result = await webSearch({
        query: String(call.input.query ?? call.input.q ?? ""),
        max_results: Number(call.input.max_results ?? 5),
      });
      return {
        ok: true,
        preview: result.summary.slice(0, 500),
        data: result,
        citations: result.citations,
      };
    }
    case "compact": {
      if (!compactCtx) {
        return { ok: false, preview: "", error: "compact 需要消息上下文。" };
      }
      const compacted = await compactCommand(compactCtx.messages, {
        conversationId: compactCtx.conversationId,
        runId: compactCtx.runId,
      });
      return {
        ok: true,
        preview: `已压缩 ${compacted.length} 条消息上下文。`,
        data: { message_count: compacted.length },
      };
    }
    case "profile_read": {
      const result = await runProfileRead();
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_read": {
      const result = await runPlanRead(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_propose": {
      if (!call.conversationId || !call.runId) {
        return { ok: false, preview: "", error: "plan_propose 需要 conversationId 与 runId。" };
      }
      const result = await runPlanPropose(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_confirm": {
      const result = await runPlanConfirm({
        ...call.input,
        conversation_id: call.input.conversation_id ?? call.conversationId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_screen_funds": {
      const result = await runPlanScreenFunds(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_check_conflicts": {
      const result = await runPlanCheckConflicts(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "plan_check_completeness": {
      const result = await runPlanCheckCompleteness(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "holdings_read": {
      const result = await runHoldingsRead();
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "holdings_propose": {
      if (!call.conversationId || !call.runId) {
        return { ok: false, preview: "", error: "holdings_propose 需要 conversationId 与 runId。" };
      }
      const result = await runHoldingsPropose(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "holdings_text_parse": {
      const result = await runHoldingsTextParse({
        user_text: String(call.input.user_text ?? ""),
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result,
        error: result.error,
      };
    }
    case "holdings_confirm": {
      const result = await runHoldingsConfirm({
        ...call.input,
        conversation_id: call.input.conversation_id ?? call.conversationId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "fund_lookup": {
      const result = await runFundLookup(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "fund_knowledge_explore": {
      const result = await runFundKnowledgeExplore(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "fund_knowledge_semantic_search": {
      const result = await runFundKnowledgeSemanticSearch(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "vision_parse": {
      const { visionParseHoldings } = await import("./vision_parse");
      const result = await visionParseHoldings({
        image_urls: Array.isArray(call.input.image_urls)
          ? (call.input.image_urls as string[])
          : undefined,
        image_url: call.input.image_url ? String(call.input.image_url) : undefined,
        demo: Boolean(call.input.demo),
        user_hint: call.input.user_hint ? String(call.input.user_hint) : undefined,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result,
        error: result.error,
      };
    }
    case "profile_propose": {
      if (!call.conversationId || !call.runId) {
        return { ok: false, preview: "", error: "profile_propose 需要 conversationId 与 runId。" };
      }
      const result = await runProfilePropose(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "profile_confirm": {
      const result = await runProfileConfirm({
        ...call.input,
        conversation_id: call.input.conversation_id ?? call.conversationId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "profile_reset_goals": {
      const result = await runProfileResetGoals(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_draft": {
      if (!call.conversationId || !call.runId) {
        return { ok: false, preview: "", error: "report_draft 需要 conversationId 与 runId。" };
      }
      const result = await runReportDraft(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
        onGatherStage: call.hooks?.onGatherStage,
        onGatherComplete: call.hooks?.onGatherComplete,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "profile_parse": {
      const result = await runProfileParse(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_read": {
      const result = await runReportRead(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "artifact_read": {
      const result = await runArtifactRead(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_publish": {
      if (!call.conversationId) {
        return { ok: false, preview: "", error: "report_publish 需要 conversationId。" };
      }
      const result = await runReportPublish(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_overlay_patch": {
      if (!call.conversationId || !call.runId) {
        return {
          ok: false,
          preview: "",
          error: "report_overlay_patch 需要 conversationId 与 runId。",
        };
      }
      const result = await runReportOverlayPatch(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_overlay_merge": {
      if (!call.conversationId || !call.runId) {
        return {
          ok: false,
          preview: "",
          error: "report_overlay_merge 需要 conversationId 与 runId。",
        };
      }
      const result = await runReportOverlayMerge(call.input, {
        conversationId: call.conversationId,
        runId: call.runId,
      });
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "report_verify": {
      const result = await runReportVerify(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "seed_sync": {
      const result = await runSeedSync(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    case "fund_watchlist_add": {
      const fundCode = String(call.input.fund_code || "");
      const result = await addToWatchlist(fundCode);
      return {
        ok: result.ok,
        preview: result.ok
          ? `已将 ${result.item?.fund_name ?? fundCode} 加入自选列表。`
          : result.error ?? "添加自选失败。",
        data: result,
        error: result.error,
      };
    }
    case "fund_watchlist_remove": {
      const fundCode = String(call.input.fund_code || "");
      const result = await removeFromWatchlist(fundCode);
      return {
        ok: result.ok,
        preview: result.ok ? `已将 ${fundCode} 从自选列表中移除。` : result.error ?? "移除自选失败。",
        data: result,
        error: result.error,
      };
    }
    case "goal_constraint_parse": {
      const result = await runGoalConstraintParse(call.input);
      return {
        ok: result.ok,
        preview: result.preview,
        data: result.data,
        error: result.error,
      };
    }
    default:
      return {
        ok: false,
        preview: "",
        error: `工具「${call.tool}」尚未实现。`,
      };
  }
}
