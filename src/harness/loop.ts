import { getSupabase } from "@/lib/supabase/server";
import {
  backgroundSubmittedMessage,
  cancelRunningJobsForConversation,
  createBackgroundJob,
  detectBackgroundJobType,
  shouldRunInBackground,
  startBackgroundJob,
  subscribeJobDone,
  subscribeJobStage,
} from "@/harness/background";
import { runCompactPipeline } from "@/harness/context/compact";
import { emitHook } from "@/harness/hooks";
import { SH08_CODE, SH08_MESSAGE } from "@/harness/locks/eligibility";
import {
  isWorkflowLockHeldByOther,
  releaseWorkflowLock,
  tryAcquireWorkflowLock,
  WorkflowLockError,
} from "@/harness/locks/store";
import { ensureRunWorkspace, createRunId } from "@/harness/runs/workspace";
import { dispatchSceneHandler } from "@/harness/scenes/router";
import {
  stalePendingHandoffCards,
  updateHandoffCardStatus,
} from "@/lib/handoff/message-cards";
import {
  MSG_STOPPED_CODE,
  MSG_STOPPED_TEXT,
  isStreamStoppedError,
  throwIfAborted,
} from "@/lib/chat/stop-generation";
import type {
  ChatStreamRequest,
  ContentBlock,
  ConversationMetadata,
  ConversationRow,
  MessageRow,
  QueryState,
  SseEventType,
  SseWriter,
} from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";
import {
  buildConversationTitle,
  formatConversationDate,
  isAutoTitleCandidate,
  summarizeFirstQuestion,
} from "@/lib/chat/conversation-title";
import { generateTitleSummary } from "@/lib/chat/generate-title-summary";
import { sanitizeUserContent } from "@/lib/chat/user-content";
import {
  parseWorkflowTaskFromStage,
  upsertWorkflowTask,
  type WorkflowTaskItem,
} from "@/lib/chat/task-progress";
import { writeStage } from "@/harness/tasks/stage";

export interface LoopResult {
  runId: string;
  assistantMessageId?: string;
  stopped?: boolean;
}

interface StreamAccumulator {
  assistantContent: string;
  contentBlocks: ContentBlock[];
  citations?: Array<{ title: string; url: string }>;
  workflowTasks: WorkflowTaskItem[];
  reasoningSummary?: string;
}

function withWorkflowMetadata(
  acc: StreamAccumulator,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadata,
    ...(acc.workflowTasks.length
      ? { workflow_tasks_snapshot: acc.workflowTasks }
      : {}),
    ...(acc.reasoningSummary
      ? { reasoning_summary_last: acc.reasoningSummary }
      : {}),
  };
}

function wrapSseWriter(
  base: SseWriter,
  acc: StreamAccumulator,
): SseWriter {
  return {
    write(event: SseEventType, data: unknown) {
      if (event === "token_delta") {
        const text = (data as { text?: string }).text;
        if (text) acc.assistantContent += text;
      }
      if (event === "content_block") {
        const block = data as ContentBlock;
        acc.contentBlocks.push(block);
        if (block.type === "text" && block.text) {
          acc.assistantContent = block.text;
        }
      }
      if (event === "stage") {
        const incoming = parseWorkflowTaskFromStage(
          data as Record<string, unknown>,
        );
        acc.workflowTasks = upsertWorkflowTask(acc.workflowTasks, incoming);
      }
      if (event === "reasoning_summary") {
        const text = (data as { text?: string }).text;
        if (text) acc.reasoningSummary = text;
      }
      base.write(event, data);
    },
    close() {
      base.close();
    },
  };
}

async function persistStoppedPartial(
  conversationId: string,
  runId: string,
  acc: StreamAccumulator,
  planIntent?: string,
): Promise<MessageRow | null> {
  const hasPartial =
    acc.assistantContent.trim().length > 0 || acc.contentBlocks.length > 0;
  if (!hasPartial) return null;

  const content =
    acc.assistantContent.trim() ||
    acc.contentBlocks.find((b) => b.type === "text")?.text ||
    MSG_STOPPED_TEXT;

  return persistAssistantMessage(
    conversationId,
    content,
    withWorkflowMetadata(acc, {
      content_blocks: acc.contentBlocks.length
        ? acc.contentBlocks
        : [{ type: "text", text: content }],
      execution_plan_intent: planIntent,
      run_id: runId,
      stopped: true,
      stop_code: MSG_STOPPED_CODE,
    }),
    acc.citations,
  );
}

async function loadConversation(
  conversationId: string,
): Promise<ConversationRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ConversationRow;
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

async function persistUserMessage(
  conversationId: string,
  content: string,
  scene: SceneId,
  attachments?: ChatStreamRequest["attachments"],
): Promise<MessageRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content,
      attachments: attachments?.length ? attachments : null,
      metadata: { scene },
    })
    .select("*")
    .single();

  if (error) return null;
  return data as MessageRow;
}

async function persistAssistantMessage(
  conversationId: string,
  content: string,
  metadata: Record<string, unknown>,
  citations?: Array<{ title: string; url: string }>,
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
      citations: citations?.length ? citations.slice(0, 5) : null,
    })
    .select("*")
    .single();

  if (error) return null;
  return data as MessageRow;
}

async function lockConversationType(
  conversationId: string,
  scene: SceneId,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;

  const conv = await loadConversation(conversationId);
  if (!conv) return;

  const metadata = conv.metadata as ConversationMetadata;
  if (metadata.type_locked) return;

  await supabase
    .from("conversations")
    .update({
      conversation_type: scene,
      metadata: {
        ...metadata,
        type_locked: true,
        active_tab: scene,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

async function touchConversation(conversationId: string): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function maybeAutoGenerateConversationTitle(
  conversationId: string,
  scene: SceneId,
  userContent: string,
  sse: SseWriter,
): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const conv = await loadConversation(conversationId);
  if (!conv) return null;

  const metadata = conv.metadata as ConversationMetadata;
  if (metadata.title_customized) return null;
  if (!isAutoTitleCandidate(conv.title)) return null;

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user");

  if ((count ?? 0) !== 1) return null;

  const cleaned = sanitizeUserContent(userContent);
  const date = formatConversationDate(conv.created_at);
  const fallbackSummary = summarizeFirstQuestion(cleaned);
  const fallbackTitle = buildConversationTitle(scene, fallbackSummary, date);

  const { error } = await supabase
    .from("conversations")
    .update({
      title: fallbackTitle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) return null;
  sse.write("conversation_title", { title: fallbackTitle });

  void improveConversationTitleWithLlm(conversationId, scene, cleaned, date, sse);
  return fallbackTitle;
}

async function improveConversationTitleWithLlm(
  conversationId: string,
  scene: SceneId,
  userContent: string,
  date: string,
  sse: SseWriter,
): Promise<void> {
  const summary = await generateTitleSummary(userContent);
  const supabase = await getSupabase();
  if (!supabase) return;

  const conv = await loadConversation(conversationId);
  if (!conv) return;
  const metadata = conv.metadata as ConversationMetadata;
  if (metadata.title_customized) return;

  const title = buildConversationTitle(scene, summary, date);
  if (title === conv.title) return;

  const { error } = await supabase
    .from("conversations")
    .update({
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (!error) {
    sse.write("conversation_title", { title });
  }
}

function attachUserMessageId(
  payload: Record<string, unknown>,
  userMessageId?: string,
): Record<string, unknown> {
  if (userMessageId) {
    return { ...payload, user_message_id: userMessageId };
  }
  return payload;
}

/**
 * s00b + s01: Harness main loop.
 * QueryState → hooks → compact → Planner → scene → Verify(stub) → Stop hook → persist
 */
export async function runHarnessLoop(
  request: ChatStreamRequest,
  sse: SseWriter,
  options?: { abortSignal?: AbortSignal },
): Promise<LoopResult> {
  const runId = createRunId();
  ensureRunWorkspace(request.conversation_id, runId);
  const acc: StreamAccumulator = {
    assistantContent: "",
    contentBlocks: [],
    workflowTasks: [],
  };
  const sseOut = wrapSseWriter(sse, acc);
  const abortSignal = options?.abortSignal;

  let unsubJobDone: (() => void) | undefined;
  let unsubJobStage: (() => void) | undefined;
  let backgroundJobId: string | undefined;

  const onAbort = () => {
    unsubJobDone?.();
    unsubJobStage?.();
    if (backgroundJobId) {
      void cancelRunningJobsForConversation(request.conversation_id);
    }
  };
  abortSignal?.addEventListener("abort", onAbort);

  let state: QueryState | undefined;
  let persistedUserMessageId: string | undefined;

  try {
    throwIfAborted(abortSignal);

    const conversation = await loadConversation(request.conversation_id);
    if (!conversation) {
      sse.write("error", { code: "ERR-NO-CONV", message: "对话不存在。" });
      sse.close();
      return { runId };
    }

    throwIfAborted(abortSignal);

    const metadata = conversation.metadata as ConversationMetadata;
    if (metadata.type_locked && request.scene !== conversation.conversation_type) {
      sse.write("error", {
        code: "ERR-SCENE-MISMATCH",
        message: "这条对话已绑定当前功能。若要办理其他事项，请切换到下方对应场景，或新建一条对话。",
      });
      sse.close();
      return { runId };
    }

    await writeStage(
      sseOut,
      {
        conversationId: request.conversation_id,
        runId,
        scene: request.scene,
      },
      {
        task_key: "planner",
        label: "理解对话",
        status: "running",
      },
    );

    const userContent = sanitizeUserContent(request.content ?? "");
    const hasAttachments = (request.attachments?.length ?? 0) > 0;
    if (!userContent && !hasAttachments && request.trigger !== "handoff_autostart") {
      sse.write("error", { code: "ERR-EMPTY", message: "消息不能为空。" });
      sse.close();
      return { runId };
    }

    const isEditResend = Boolean(request.edit_resend_message_id);

    const persistContent = userContent || (hasAttachments ? "[图片]" : "");

    if (persistContent) {
      await stalePendingHandoffCards(request.conversation_id);

      await emitHook("UserPromptSubmit", {
        event: "UserPromptSubmit",
        conversationId: request.conversation_id,
        runId,
        scene: request.scene,
        userMessage: persistContent,
      });

      if (!isEditResend) {
        const userRow = await persistUserMessage(
          request.conversation_id,
          persistContent,
          request.scene,
          request.attachments,
        );
        if (userRow?.id) {
          persistedUserMessageId = userRow.id;
          sse.write("user_persisted", { message_id: userRow.id });
        }
        await lockConversationType(request.conversation_id, request.scene);
        await maybeAutoGenerateConversationTitle(
          request.conversation_id,
          request.scene,
          persistContent,
          sseOut,
        );
      }
    }

    let messages = await loadMessages(request.conversation_id);

    messages = await runCompactPipeline(messages, {
      conversationId: request.conversation_id,
      runId,
    });

    const stateInit: QueryState = {
    runId,
    conversationId: request.conversation_id,
    conversationType: conversation.conversation_type,
    scene: request.scene,
    messages,
    plan: null,
    attachments: request.attachments,
    trigger: request.trigger,
    handoffSummary: request.handoff_summary,
    sourceConversationId: request.source_conversation_id,
    handoffCardMessageId: request.handoff_card_message_id,
    abortSignal,
    };
    state = stateInit;

    if (request.trigger === "handoff_autostart") {
      await lockConversationType(request.conversation_id, request.scene);
      if (request.handoff_card_message_id) {
        await updateHandoffCardStatus(request.handoff_card_message_id, "accepted");
      }
      sse.write("handoff_ready", {
        target_conversation_id: request.conversation_id,
        target_scene: request.target_scene ?? request.scene,
        source_conversation_id: request.source_conversation_id,
      });
    }

    const bgJobType = userContent
      ? detectBackgroundJobType(request.scene, userContent)
      : null;
    if (userContent && bgJobType && shouldRunInBackground(bgJobType)) {
      if (await isWorkflowLockHeldByOther(request.conversation_id)) {
        const blocked = SH08_MESSAGE;
        const assistant = await persistAssistantMessage(
          request.conversation_id,
          blocked,
          {
            content_blocks: [{ type: "text", text: blocked }],
            error_code: SH08_CODE,
            run_id: runId,
          },
        );
        await touchConversation(request.conversation_id);
        // F5: 写锁冲突仅以助手气泡展示，不单独开 error stage（§5.3.15）
        sse.write("content_block", { type: "text", text: blocked });
        sse.write("done", attachUserMessageId({ message_id: assistant?.id, run_id: runId }, persistedUserMessageId));
        sse.close();
        return { runId, assistantMessageId: assistant?.id };
      }

      const lockKey =
        request.scene === "profile" ||
        request.scene === "plan" ||
        request.scene === "portfolio"
          ? request.scene
          : null;
      if (lockKey) {
        const acquired = await tryAcquireWorkflowLock(lockKey, request.conversation_id);
        if (!acquired) {
          const blocked = SH08_MESSAGE;
          const assistant = await persistAssistantMessage(
            request.conversation_id,
            blocked,
            {
              content_blocks: [{ type: "text", text: blocked }],
              error_code: SH08_CODE,
              run_id: runId,
            },
          );
          await touchConversation(request.conversation_id);
          // F5: 写锁冲突仅以助手气泡展示，不单独开 error stage（§5.3.15）
          sse.write("content_block", { type: "text", text: blocked });
          sse.write("done", attachUserMessageId({ message_id: assistant?.id, run_id: runId }, persistedUserMessageId));
          sse.close();
          return { runId, assistantMessageId: assistant?.id };
        }
      }

      const bgRunId = createRunId();
      ensureRunWorkspace(request.conversation_id, bgRunId);

      const job = await createBackgroundJob({
        conversationId: request.conversation_id,
        runId: bgRunId,
        jobType: bgJobType,
      });
      if (job) {
        backgroundJobId = job.id;

        const jobDonePromise = new Promise<void>((resolve) => {
          unsubJobDone = subscribeJobDone(
            request.conversation_id,
            (payload) => {
              if (payload.job_id !== job.id) return;
              sse.write("job_done", payload);
              unsubJobDone?.();
              unsubJobDone = undefined;
              unsubJobStage?.();
              unsubJobStage = undefined;
              resolve();
            },
          );
        });

        // A1: 不桥接 stage / content_block 到前台 SSE，
        //     避免 ack 消息带上后台 job 的进度条。
        //     后台进度仅写入 DB，job_done 后前端 reload 时通过 hydration 赋给 result 消息。
        unsubJobStage = subscribeJobStage(
          request.conversation_id,
          (payload) => {
            if (payload.job_id !== job.id) return;
            if (abortSignal?.aborted) return;
            if (
              payload.event === "reasoning_summary" &&
              typeof (payload.data as { text?: string }).text === "string"
            ) {
              sseOut.write("reasoning_summary", payload.data);
            }
            if (
              payload.event === "token_delta" &&
              typeof (payload.data as { text?: string }).text === "string"
            ) {
              sseOut.write("token_delta", payload.data);
            }
          },
        );

        startBackgroundJob({
          jobId: job.id,
          conversationId: request.conversation_id,
          runId: bgRunId,
          jobType: bgJobType,
          scene: request.scene,
          userMessage: userContent,
          request,
        });

        const ack = backgroundSubmittedMessage(bgJobType);

        const assistant = await persistAssistantMessage(
          request.conversation_id,
          ack,
          withWorkflowMetadata(
            { ...acc, workflowTasks: [] },
            {
              content_blocks: [{ type: "text", text: ack }],
              background_job_id: job.id,
              background_job_type: bgJobType,
              background_run_id: bgRunId,
              run_id: runId,
            },
          ),
        );
        await touchConversation(request.conversation_id);
        sse.write(
          "done",
          attachUserMessageId(
            {
              message_id: assistant?.id,
              run_id: runId,
              background_job_id: job.id,
              background_run_id: bgRunId,
            },
            persistedUserMessageId,
          ),
        );

        if (abortSignal?.aborted) {
          sse.close();
          return { runId, assistantMessageId: assistant?.id };
        }

        await Promise.race([
          jobDonePromise,
          new Promise<void>((resolve) => {
            abortSignal?.addEventListener("abort", () => resolve(), { once: true });
          }),
        ]);

        sse.close();
        return { runId, assistantMessageId: assistant?.id };
      }
    }

    throwIfAborted(abortSignal);

    const { plan, assistantContent, contentBlocks, citations } =
      await dispatchSceneHandler(stateInit, userContent, sseOut);

    acc.citations = citations;
    state.plan = plan;

    await emitHook("Stop", {
      event: "Stop",
      conversationId: request.conversation_id,
      runId,
      scene: request.scene,
    });

    const assistant = await persistAssistantMessage(
      request.conversation_id,
      assistantContent,
      withWorkflowMetadata(acc, {
        content_blocks: contentBlocks,
        execution_plan_intent: plan.intent,
        run_id: runId,
      }),
      citations,
    );

    await touchConversation(request.conversation_id);

    sse.write(
      "done",
      attachUserMessageId({ message_id: assistant?.id, run_id: runId }, persistedUserMessageId),
    );
    sse.close();

    return { runId, assistantMessageId: assistant?.id };
  } catch (err) {
    if (err instanceof WorkflowLockError) {
      const blocked = err.message || SH08_MESSAGE;
      const assistant = await persistAssistantMessage(
        request.conversation_id,
        blocked,
        {
          content_blocks: [{ type: "text", text: blocked }],
          error_code: SH08_CODE,
          run_id: runId,
        },
      );
      await touchConversation(request.conversation_id);
      sse.write("error", { code: SH08_CODE, message: blocked });
      sse.write(
        "done",
        attachUserMessageId({ message_id: assistant?.id, run_id: runId }, persistedUserMessageId),
      );
      sse.close();
      return { runId, assistantMessageId: assistant?.id };
    }

    if (isStreamStoppedError(err) || abortSignal?.aborted) {
      const assistant = await persistStoppedPartial(
        request.conversation_id,
        runId,
        acc,
        state?.plan?.intent,
      );
      await touchConversation(request.conversation_id);
      sse.write("stopped", {
        code: MSG_STOPPED_CODE,
        message: MSG_STOPPED_TEXT,
      });
      sse.write(
        "done",
        attachUserMessageId(
          {
            run_id: runId,
            stopped: true,
            message_id: assistant?.id,
          },
          persistedUserMessageId,
        ),
      );
      sse.close();
      return {
        runId,
        assistantMessageId: assistant?.id,
        stopped: true,
      };
    }

    const message =
      err instanceof Error ? err.message : "处理消息时发生未知错误。";
    sse.write("error", { code: "ERR-HARNESS", message });
    sse.write(
      "done",
      attachUserMessageId({ run_id: runId, error: true }, persistedUserMessageId),
    );
    sse.close();
    return { runId };
  } finally {
    abortSignal?.removeEventListener("abort", onAbort);
    if (!backgroundJobId) {
      await releaseWorkflowLock(request.conversation_id);
    }
  }
}
