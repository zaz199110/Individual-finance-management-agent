import type { ExecutionPlan, QueryState, SseWriter } from "@/harness/types";
import type { WorkflowTaskStatus } from "@/lib/chat/task-progress";
import { resolveWorkflowTaskDef } from "./catalog";
import { upsertWorkflowTaskRow } from "./sync";

export interface WriteStageInput {
  task_key: string;
  label?: string;
  status: WorkflowTaskStatus;
  parent_task_key?: string | null;
  node_depth?: 1 | 2;
  sort_order?: number;
}

/** 避免同一 runId:taskKey 被反复 emit 相同 status 的 SSE 事件 */
const lastStatusCache = new Map<string, WorkflowTaskStatus>();

function persistWorkflowTaskRow(
  conversationId: string,
  runId: string,
  payload: {
    task_key: string;
    label: string;
    status: WorkflowTaskStatus;
    parent_task_key?: string | null;
    node_depth: 1 | 2;
    sort_order: number;
  },
): Promise<void> {
  return upsertWorkflowTaskRow(conversationId, runId, payload).catch((err) => {
    console.error("[writeStage] persist failed", err);
  });
}

export async function writeStage(
  sse: SseWriter,
  state: Pick<QueryState, "conversationId" | "runId" | "scene">,
  input: WriteStageInput,
): Promise<void> {
  const def = resolveWorkflowTaskDef(input, state.scene);
  const cacheKey = `${state.runId}:${def.task_key}`;
  if (lastStatusCache.get(cacheKey) === input.status) {
    return;
  }
  lastStatusCache.set(cacheKey, input.status);
  const payload = {
    task_key: def.task_key,
    label: def.label,
    status: input.status,
    parent_task_key: def.parent_task_key,
    node_depth: def.node_depth,
    sort_order: def.sort_order,
  };

  sse.write("stage", payload);
  sse.write("progress", { task_key: payload.task_key, status: payload.status });
  await persistWorkflowTaskRow(state.conversationId, state.runId, payload);
}

/** Planner 完成后一次性把计划步骤推到 UI，让用户尽早看到完整进度条 */
export async function emitPlanStepsToSse(
  sse: SseWriter,
  state: Pick<QueryState, "conversationId" | "runId" | "scene">,
  plan: ExecutionPlan,
): Promise<void> {
  const persists: Promise<void>[] = [];
  for (const [index, step] of plan.steps.entries()) {
    const def = resolveWorkflowTaskDef(
      {
        task_key: step.key,
        label: step.label,
        sort_order: (index + 1) * 10,
      },
      state.scene,
    );
    const payload = {
      task_key: def.task_key,
      label: def.label,
      status: (step.status ?? "pending") as WorkflowTaskStatus,
      parent_task_key: def.parent_task_key,
      node_depth: def.node_depth,
      sort_order: def.sort_order,
    };
    sse.write("stage", payload);
    sse.write("progress", { task_key: payload.task_key, status: payload.status });
    persists.push(persistWorkflowTaskRow(state.conversationId, state.runId, payload));
  }
  await Promise.all(persists);
}

export async function seedWorkflowTasks(
  state: Pick<QueryState, "conversationId" | "runId" | "scene">,
  taskKeys: string[],
  status: WorkflowTaskStatus = "pending",
  sse?: SseWriter,
): Promise<void> {
  for (const taskKey of taskKeys) {
    const def = resolveWorkflowTaskDef({ task_key: taskKey }, state.scene);
    const payload = {
      task_key: def.task_key,
      label: def.label,
      status,
      parent_task_key: def.parent_task_key,
      node_depth: def.node_depth,
      sort_order: def.sort_order,
    };
    if (sse) {
      sse.write("stage", payload);
      sse.write("progress", {
        task_key: payload.task_key,
        status: payload.status,
      });
    }
    await persistWorkflowTaskRow(state.conversationId, state.runId, payload);
  }
}
