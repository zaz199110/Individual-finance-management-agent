import {
  hasBlockedWorkflowTask,
  mergeWorkflowTaskLists,
  parseWorkflowTasksFromMetadata,
  parseWorkflowTaskFromStage,
  sortWorkflowTasks,
  upsertWorkflowTask,
  shouldAutoCollapseTaskProgress,
  type WorkflowTaskItem,
} from "@/lib/chat/task-progress";
import type { ChatMessage, MessageContentBlock } from "@/components/chat/types";

export interface LoadConversationOptions {
  /** 切换对话时为 true；流式结束/后台同步时为 false，避免骨架屏闪屏 */
  showSkeleton?: boolean;
}

export interface StreamDonePayload {
  stopped?: boolean;
  run_id?: string;
  message_id?: string;
  user_message_id?: string;
  background_job_id?: string;
}

export interface ApiMessageRow {
  id: string;
  role: string;
  content: string | null;
  citations?: Array<{ title: string; url: string }>;
  metadata?: Record<string, unknown> | null;
}

export function resolveWorkflowHydrationRunId(
  metadata?: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  const bgRun = metadata.background_run_id;
  if (typeof bgRun === "string" && bgRun.length > 0) return bgRun;
  const runId = metadata.run_id;
  if (typeof runId === "string" && runId.length > 0) return runId;
  return null;
}

export function mapApiMessageToChatMessage(m: ApiMessageRow): ChatMessage {
  const metadata = m.metadata ?? undefined;
  const workflowTasks = parseWorkflowTasksFromMetadata(metadata);
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content ?? "",
    citations: m.citations ?? undefined,
    contentBlocks: undefined,
    runId: typeof metadata?.run_id === "string" ? metadata.run_id : undefined,
    backgroundJobId:
      typeof metadata?.background_job_id === "string"
        ? metadata.background_job_id
        : undefined,
    backgroundRunId:
      typeof metadata?.background_run_id === "string"
        ? metadata.background_run_id
        : undefined,
    workflowTasks: workflowTasks.length ? workflowTasks : undefined,
    reasoningSummary:
      typeof metadata?.reasoning_summary_last === "string"
        ? metadata.reasoning_summary_last
        : undefined,
    stopped: metadata?.stopped === true,
  };
}

export function messageNeedsWorkflowTaskHydration(
  message: Pick<ApiMessageRow, "role" | "metadata">,
): boolean {
  if (message.role !== "assistant") return false;
  if (parseWorkflowTasksFromMetadata(message.metadata).length > 0) return false;
  // A1: ack 消息同时带 background_job_id + background_run_id，
  //     跳过 hydration 使其不显示进度条（进度只给后台 job 的 result 消息）。
  const md = message.metadata;
  const bgJobId = md?.background_job_id;
  const bgRunId = md?.background_run_id;
  if (
    typeof bgJobId === "string" && bgJobId.length > 0 &&
    typeof bgRunId === "string" && bgRunId.length > 0
  ) {
    return false;
  }
  return resolveWorkflowHydrationRunId(message.metadata) != null;
}

/** 服务端一次查询 workflow_tasks 后，补全缺少 snapshot 的助手消息 metadata。 */
export function enrichApiMessagesWithWorkflowTasks<T extends ApiMessageRow>(
  messages: T[],
  taskRows: Array<Record<string, unknown>>,
): T[] {
  if (!messages.length || !taskRows.length) return messages;

  const tasksByRunId = new Map<string, WorkflowTaskItem[]>();
  for (const row of taskRows) {
    const runId = typeof row.run_id === "string" ? row.run_id : "";
    if (!runId) continue;
    const list = tasksByRunId.get(runId) ?? [];
    list.push(
      parseWorkflowTaskFromStage({
        task_key: row.task_key,
        label: row.label,
        status: row.status,
        parent_task_key: row.parent_task_key,
        node_depth: row.node_depth,
        sort_order: row.sort_order,
      }),
    );
    tasksByRunId.set(runId, list);
  }

  if (tasksByRunId.size === 0) return messages;

  return messages.map((message) => {
    if (!messageNeedsWorkflowTaskHydration(message)) return message;
    const runId = resolveWorkflowHydrationRunId(message.metadata);
    if (!runId) return message;
    const tasks = tasksByRunId.get(runId);
    if (!tasks?.length) return message;
    return {
      ...message,
      metadata: {
        ...(message.metadata ?? {}),
        workflow_tasks_snapshot: sortWorkflowTasks(tasks),
      },
    };
  });
}

export function messagesNeedWorkflowTaskHydration(
  messages: Array<Pick<ApiMessageRow, "role" | "metadata">>,
): boolean {
  return messages.some(messageNeedsWorkflowTaskHydration);
}

export async function hydrateWorkflowTasksFromApi(
  conversationId: string,
  message: ChatMessage,
): Promise<ChatMessage> {
  if (message.workflowTasks?.length || !message.runId) return message;
  try {
    const res = await fetch(
      `/api/conversations/${conversationId}/workflow-tasks?run_id=${encodeURIComponent(message.runId)}`,
    );
    if (!res.ok) return message;
    const data = (await res.json()) as { tasks?: WorkflowTaskItem[] };
    if (!data.tasks?.length) return message;
    return { ...message, workflowTasks: data.tasks };
  } catch {
    return message;
  }
}

/** 一次请求补全对话内所有缺少 snapshot 的助手消息，避免按 run_id 串行 N 次 fetch */
export async function hydrateWorkflowTasksBatch(
  conversationId: string,
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const pending = messages.filter(
    (m) =>
      (m.backgroundRunId || m.runId) &&
      !m.workflowTasks?.length &&
      m.role === "assistant",
  );
  if (!pending.length) return messages;

  const resolveHydrationRunId = (m: ChatMessage) =>
    m.backgroundRunId ?? m.runId;

  try {
    const res = await fetch(
      `/api/conversations/${conversationId}/workflow-tasks`,
    );
    if (!res.ok) {
      return await Promise.all(
        messages.map((m) => hydrateWorkflowTasksFromApi(conversationId, m)),
      );
    }
    const data = (await res.json()) as {
      tasks_by_run_id?: Record<string, WorkflowTaskItem[]>;
    };
    const byRun = data.tasks_by_run_id ?? {};
    return messages.map((m) => {
      const hydrationRunId = resolveHydrationRunId(m);
      if (!hydrationRunId || m.workflowTasks?.length) return m;
      const tasks = byRun[hydrationRunId];
      return tasks?.length ? { ...m, workflowTasks: tasks } : m;
    });
  } catch {
    return messages;
  }
}

export function applyStageEventToMessage(
  message: ChatMessage,
  data: Record<string, unknown>,
): ChatMessage {
  const incoming = parseWorkflowTaskFromStage(data);
  const workflowTasks = upsertWorkflowTask(message.workflowTasks ?? [], incoming);
  return { ...message, workflowTasks };
}

export function applyReasoningSummaryToMessage(
  message: ChatMessage,
  text: string,
): ChatMessage {
  return { ...message, reasoningSummary: text };
}

export function applyAssistantStreamContent(
  messages: ChatMessage[],
  assistantId: string,
  content: string,
  contentBlocks: MessageContentBlock[],
): ChatMessage[] {
  return messages.map((m) =>
    m.id === assistantId
      ? {
          ...m,
          content,
          contentBlocks: contentBlocks.length ? [...contentBlocks] : m.contentBlocks,
          streaming: true,
        }
      : m,
  );
}

/** SSE user_persisted / done.user_message_id：将 temp-user 原地替换为服务端 id，避免重复气泡 */
export function applyUserPersistedToMessages(
  messages: ChatMessage[],
  tempUserId: string,
  serverUserId: string,
): ChatMessage[] {
  if (messages.some((m) => m.id === serverUserId)) {
    return messages.filter((m) => m.id !== tempUserId);
  }
  return messages.map((m) =>
    m.id === tempUserId ? { ...m, id: serverUserId } : m,
  );
}

export function applyDoneEventToMessages(
  messages: ChatMessage[],
  assistantId: string,
  payload: StreamDonePayload,
  stoppedMessage: string,
): { messages: ChatMessage[]; assistantId: string } {
  let resolvedId = assistantId;
  const next = messages.map((m) => {
    if (m.id !== assistantId) return m;
    let updated = payload.stopped
      ? appendStoppedTask(
          finalizeStreamingMessage(
            { ...m, stopped: true, taskProgressExpanded: true },
            { stopped: true },
          ),
          stoppedMessage,
        )
      : finalizeStreamingMessage(m, {
          stopped: false,
          backgroundPending: Boolean(payload.background_job_id),
        });
    if (typeof payload.run_id === "string") {
      updated = { ...updated, runId: payload.run_id };
    }
    if (typeof payload.message_id === "string") {
      updated = { ...updated, id: payload.message_id };
      resolvedId = payload.message_id;
    }
    return updated;
  });
  return { messages: next, assistantId: resolvedId };
}

export function finalizeStreamingMessage(
  message: ChatMessage,
  opts: { stopped?: boolean; backgroundPending?: boolean },
): ChatMessage {
  const workflowTasks = message.workflowTasks ?? [];
  const backgroundPending =
    opts.backgroundPending ?? Boolean(message.backgroundJobId);
  const autoCollapse = shouldAutoCollapseTaskProgress(workflowTasks, {
    streaming: false,
    stopped: opts.stopped,
    backgroundPending,
  });
  return {
    ...message,
    streaming: false,
    stopped: opts.stopped ?? message.stopped,
    taskProgressExpanded: autoCollapse ? false : true,
  };
}

export function createOptimisticPlannerTask(): WorkflowTaskItem {
  return {
    task_key: "planner",
    label: "理解对话",
    status: "running",
    parent_task_key: null,
    node_depth: 1,
    sort_order: 0,
  };
}

/** 流式已开始但尚无正文、进度条或卡片可展示时，应显示等待动画而非空气泡 */
export function isAssistantWaitingForResponse(message: ChatMessage): boolean {
  if (message.role !== "assistant" || !message.streaming) return false;
  if ((message.workflowTasks?.length ?? 0) > 0) return false;
  if (message.content.trim().length > 0) return false;
  if ((message.contentBlocks?.length ?? 0) > 0) return false;
  return true;
}

export function isTaskProgressExpanded(message: ChatMessage): boolean {
  return (
    message.taskProgressExpanded ??
    (!shouldAutoCollapseTaskProgress(message.workflowTasks ?? [], {
      streaming: message.streaming,
      stopped: message.stopped,
      backgroundPending: Boolean(message.backgroundJobId),
    }) ||
      hasBlockedWorkflowTask(message.workflowTasks ?? []))
  );
}

export function toggleTaskProgressExpanded(message: ChatMessage): ChatMessage {
  return {
    ...message,
    taskProgressExpanded: !isTaskProgressExpanded(message),
  };
}

/** 发送时乐观插入的 temp-user 在服务端落库后 id 不同，合并时需去掉以免重复气泡 */
function dropOptimisticUserDuplicates(
  local: ChatMessage[],
  server: ChatMessage[],
): ChatMessage[] {
  const serverUserContents = new Set(
    server.filter((m) => m.role === "user").map((m) => m.content.trim()),
  );
  const persistedUserContents = new Set(
    local
      .filter((m) => m.role === "user" && !m.id.startsWith("temp-user-"))
      .map((m) => m.content.trim()),
  );
  return local.filter((m) => {
    if (!m.id.startsWith("temp-user-")) return true;
    const content = m.content.trim();
    if (serverUserContents.has(content)) return false;
    if (persistedUserContents.has(content)) return false;
    return true;
  });
}

/** merge 兜底：同一 content 的 temp-user 与已落库 user 并存时去掉 temp */
function collapseDuplicateUserBubbles(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user" && message.id.startsWith("temp-user-")) {
      const duplicate = result.some(
        (m) =>
          m.role === "user" &&
          m.content.trim() === message.content.trim(),
      );
      if (duplicate) continue;
    }
    if (message.role === "user" && !message.id.startsWith("temp-user-")) {
      const tempIdx = result.findIndex(
        (m) =>
          m.role === "user" &&
          m.id.startsWith("temp-user-") &&
          m.content.trim() === message.content.trim(),
      );
      if (tempIdx >= 0) result.splice(tempIdx, 1);
    }
    result.push(message);
  }
  return result;
}

/** job_done / 重连：保留本地顺序，合并服务端更新并 append 新消息 */
export function mergeConversationMessages(
  local: ChatMessage[],
  server: ChatMessage[],
  opts?: { completedBackgroundJobId?: string },
): ChatMessage[] {
  const localFiltered = dropOptimisticUserDuplicates(local, server);
  const serverById = new Map(server.map((m) => [m.id, m]));
  const merged = localFiltered.map((m) => {
    const s = serverById.get(m.id);
    if (!s) return m;
    const ackCompleted =
      opts?.completedBackgroundJobId &&
      m.backgroundJobId === opts.completedBackgroundJobId;
    return {
      ...s,
      content: s.content || m.content,
      contentBlocks: s.contentBlocks?.length ? s.contentBlocks : m.contentBlocks,
      workflowTasks: ackCompleted
        ? (s.workflowTasks ?? [])
        : mergeWorkflowTaskLists(m.workflowTasks, s.workflowTasks ?? []),
      backgroundJobId: ackCompleted ? undefined : m.backgroundJobId,
      backgroundRunId: ackCompleted ? undefined : m.backgroundRunId,
      taskProgressExpanded: ackCompleted
        ? hasBlockedWorkflowTask(s.workflowTasks ?? []) ||
          hasBlockedWorkflowTask(m.workflowTasks ?? [])
        : (m.taskProgressExpanded ?? true),
    };
  });
  const localIds = new Set(localFiltered.map((m) => m.id));
  for (const s of server) {
    if (!localIds.has(s.id)) merged.push(s);
  }
  return collapseDuplicateUserBubbles(merged);
}

export function appendStoppedTask(message: ChatMessage, label: string): ChatMessage {
  return applyStageEventToMessage(message, {
    task_key: "msg-stopped",
    label,
    status: "done",
    node_depth: 1,
    sort_order: 99999,
  });
}
