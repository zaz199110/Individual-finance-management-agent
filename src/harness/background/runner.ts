import { runCompactPipeline } from "@/harness/context/compact";
import { dispatchSceneHandler } from "@/harness/scenes/router";
import { ensureRunWorkspace } from "@/harness/runs/workspace";
import { getSupabase } from "@/lib/supabase/server";
import type {
  ChatStreamRequest,
  ContentBlock,
  ConversationMetadata,
  ConversationRow,
  MessageRow,
  QueryState,
  SseWriter,
} from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";
import { emitJobDone, emitJobStage } from "./notify";
import type { JobStreamEvent } from "./notify";
import { releaseWorkflowLock } from "@/harness/locks/store";
import {
  finishBackgroundJob,
  isJobCancelled,
} from "./store";
import type { BackgroundJobType, JobDonePayload } from "./types";

const BACKGROUND_STREAM_EVENTS = new Set([
  "stage",
  "progress",
  "reasoning_summary",
  "token_delta",
  "content_block",
]);

function createBackgroundSseBridge(
  conversationId: string,
  jobId: string,
): SseWriter {
  return {
    write(event, data) {
      if (BACKGROUND_STREAM_EVENTS.has(event)) {
        emitJobStage(conversationId, {
          job_id: jobId,
          event: event as JobStreamEvent,
          data,
        });
      }
    },
    close() {},
  };
}

async function loadConversation(
  conversationId: string,
): Promise<ConversationRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

async function loadMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

async function persistAssistantMessage(
  conversationId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<MessageRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content,
      metadata,
    })
    .select("*")
    .single();

  if (error) return null;
  return data as MessageRow;
}

async function touchConversation(conversationId: string): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export interface BackgroundJobContext {
  jobId: string;
  conversationId: string;
  runId: string;
  jobType: BackgroundJobType;
  scene: SceneId;
  userMessage: string;
  request: ChatStreamRequest;
}

async function executeJobWork(ctx: BackgroundJobContext): Promise<{
  assistantContent: string;
  contentBlocks: ContentBlock[];
  planIntent?: string;
}> {
  const conversation = await loadConversation(ctx.conversationId);
  if (!conversation) {
    throw new Error("对话不存在");
  }

  ensureRunWorkspace(ctx.conversationId, ctx.runId);

  let messages = await loadMessages(ctx.conversationId);
  messages = await runCompactPipeline(messages, {
    conversationId: ctx.conversationId,
    runId: ctx.runId,
  });

  const metadata = conversation.metadata as ConversationMetadata;
  const state: QueryState = {
    runId: ctx.runId,
    conversationId: ctx.conversationId,
    conversationType: conversation.conversation_type,
    scene: ctx.scene,
    messages,
    plan: null,
    attachments: ctx.request.attachments,
    trigger: ctx.request.trigger,
    handoffSummary: ctx.request.handoff_summary,
    sourceConversationId: ctx.request.source_conversation_id,
    handoffCardMessageId: ctx.request.handoff_card_message_id,
  };

  const sse = createBackgroundSseBridge(ctx.conversationId, ctx.jobId);
  const { plan, assistantContent, contentBlocks } = await dispatchSceneHandler(
    state,
    ctx.userMessage,
    sse,
  );

  return {
    assistantContent,
    contentBlocks,
    planIntent: plan.intent,
  };
}

function summarizeResult(
  jobType: BackgroundJobType,
  content: string,
  blocks: ContentBlock[],
): string {
  const reportCard = blocks.find((b) => b.type === "report_publish_card");
  if (reportCard && reportCard.type === "report_publish_card") {
    return `《${reportCard.report_name}》草稿已就绪，请确认发布。`;
  }
  if (content.trim()) return content.slice(0, 200);
  if (jobType === "deep_analysis") return "持仓分析已完成。";
  return "后台任务已完成。";
}

/**
 * 在独立 run 中执行 Harness 逻辑；完成后写 assistant 消息并 emit job_done。
 */
export async function runBackgroundJob(ctx: BackgroundJobContext): Promise<void> {
  const basePayload: Omit<JobDonePayload, "status"> = {
    job_id: ctx.jobId,
    conversation_id: ctx.conversationId,
    run_id: ctx.runId,
    job_type: ctx.jobType,
  };

  try {
    if (await isJobCancelled(ctx.jobId)) {
      emitJobDone({ ...basePayload, status: "cancelled" });
      return;
    }

    const result = await executeJobWork(ctx);

    if (await isJobCancelled(ctx.jobId)) {
      emitJobDone({ ...basePayload, status: "cancelled" });
      return;
    }

    const assistant = await persistAssistantMessage(
      ctx.conversationId,
      result.assistantContent,
      {
        content_blocks: result.contentBlocks,
        execution_plan_intent: result.planIntent,
        run_id: ctx.runId,
        background_job_id: ctx.jobId,
      },
    );

    await finishBackgroundJob(ctx.jobId, "done");
    await touchConversation(ctx.conversationId);

    emitJobDone({
      ...basePayload,
      status: "done",
      message_id: assistant?.id,
      summary: summarizeResult(
        ctx.jobType,
        result.assistantContent,
        result.contentBlocks,
      ),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "后台任务执行失败。";

    if (!(await isJobCancelled(ctx.jobId))) {
      await finishBackgroundJob(ctx.jobId, "failed");
      await persistAssistantMessage(ctx.conversationId, `后台任务失败：${message}`, {
        background_job_id: ctx.jobId,
        background_job_failed: true,
        run_id: ctx.runId,
      });
      await touchConversation(ctx.conversationId);
    }

    emitJobDone({
      ...basePayload,
      status: "failed",
      error: message,
    });
  } finally {
    await releaseWorkflowLock(ctx.conversationId);
  }
}

/** 非阻塞启动后台 job */
export function startBackgroundJob(ctx: BackgroundJobContext): void {
  void runBackgroundJob(ctx).catch((err) => {
    console.error("[startBackgroundJob]", err);
  });
}

export function backgroundSubmittedMessage(jobType: BackgroundJobType): string {
  if (jobType === "deep_analysis") {
    return "持仓分析报告正在后台生成，完成后会在此对话通知您；您可以先切换其他 Tab。";
  }
  if (jobType === "scheduled") {
    return "定时任务已在后台执行。";
  }
  return "报告正在后台生成，完成后会在此对话通知您；您可以先切换其他 Tab。";
}
