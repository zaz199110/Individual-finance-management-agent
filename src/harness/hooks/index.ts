import { registerHook } from "./registry";
import type { HookContext, HookResult } from "./types";
import { SH08_MESSAGE } from "@/harness/locks/eligibility";
import { isWorkflowLockHeldByOther } from "@/harness/locks/store";

/** Inject scene context on each user message. */
registerHook("UserPromptSubmit", async (ctx: HookContext): Promise<HookResult> => {
  return {
    reminders: [`当前对话场景 Tab：${ctx.scene}。首条消息后类型将锁定。`],
  };
});

/** Block write tools without confirm token; enforce SH-08 workflow lock. */
registerHook("PreToolUse", async (ctx: HookContext): Promise<HookResult> => {
  const writeTools = new Set([
    "profile_confirm",
    "plan_confirm",
    "holdings_confirm",
    "report_publish",
    "fund_watchlist_add",
    "fund_watchlist_remove",
    "profile_propose",
    "plan_propose",
    "holdings_propose",
    "report_draft",
  ]);
  if (!ctx.toolName || !writeTools.has(ctx.toolName)) {
    return {};
  }

  if (await isWorkflowLockHeldByOther(ctx.conversationId)) {
    return {
      blocked: true,
      blockReason: SH08_MESSAGE,
    };
  }

  const needsConfirm = new Set([
    "profile_confirm",
    "plan_confirm",
    "holdings_confirm",
    "report_publish",
  ]);
  if (needsConfirm.has(ctx.toolName)) {
    const hasToken = Boolean(
      (ctx.toolInput as { confirm_token?: string } | undefined)?.confirm_token,
    );
    if (!hasToken) {
      return {
        blocked: true,
        blockReason: "写操作须用户确认后再执行。",
      };
    }
  }
  return {};
});

/** PostToolUse: 审计日志 — 记录工具调用结果摘要到控制台。 */
registerHook("PostToolUse", async (ctx: HookContext): Promise<HookResult> => {
  const preview = ctx.toolResultPreview ?? "";
  if (preview.length > 4000) {
    return {
      reminders: ["tool_result 较大，已触发 L3 落盘策略。"],
    };
  }
  // 写类工具审计：记录 tool name + conversation + 结果摘要
  const writeTools = new Set([
    "profile_confirm", "plan_confirm", "holdings_confirm",
    "report_publish", "report_draft",
    "profile_propose", "plan_propose", "holdings_propose",
  ]);
  if (ctx.toolName && writeTools.has(ctx.toolName)) {
    console.log(
      `[audit] tool=${ctx.toolName} conv=${ctx.conversationId.slice(0, 8)} ` +
      `scene=${ctx.scene} result=${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}`,
    );
  }
  return {};
});

/** Stop hook — 持久化 plan snapshot 到 workflow_tasks 表。 */
registerHook("Stop", async (ctx: HookContext): Promise<HookResult> => {
  // 查询当前 run 的 workflow_tasks 并输出摘要日志
  try {
    const { getSupabase } = await import("@/lib/supabase/server");
    const supabase = await getSupabase();
    if (!supabase) return {};

    const { data: tasks } = await supabase
      .from("workflow_tasks")
      .select("task_key, label, status")
      .eq("conversation_id", ctx.conversationId)
      .eq("run_id", ctx.runId)
      .order("sort_order", { ascending: true });

    if (tasks && tasks.length > 0) {
      const summary = tasks.map((t) => `${t.task_key}:${t.status}`).join(", ");
      console.log(`[stop] plan snapshot conv=${ctx.conversationId.slice(0, 8)} run=${ctx.runId.slice(0, 8)} tasks=[${summary}]`);
    }
  } catch {
    // 容错：不影响主流程
  }
  return {};
});

export { emitHook, registerHook } from "./registry";
