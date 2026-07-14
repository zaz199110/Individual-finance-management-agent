import { getSupabase } from "@/lib/supabase/server";
import type { ExecutionPlan } from "@/harness/types";
import { resolveWorkflowTaskDef } from "./catalog";

export interface WorkflowTaskRowInput {
  task_key: string;
  label: string;
  status: string;
  parent_task_key?: string | null;
  node_depth: 1 | 2;
  sort_order: number;
  skill?: string | null;
  command?: string | null;
}

export async function upsertWorkflowTaskRow(
  conversationId: string,
  runId: string,
  task: WorkflowTaskRowInput,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("workflow_tasks").upsert(
    {
      conversation_id: conversationId,
      run_id: runId,
      task_key: task.task_key,
      parent_task_key: task.parent_task_key ?? null,
      node_depth: task.node_depth,
      label: task.label,
      status: task.status,
      skill: task.skill ?? null,
      command: task.command ?? null,
      sort_order: task.sort_order,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "run_id,task_key" },
  );

  if (error) {
    console.error("[upsertWorkflowTaskRow]", error.message);
  }
}

export async function syncWorkflowTasks(
  conversationId: string,
  runId: string,
  plan: ExecutionPlan,
  scene?: Parameters<typeof resolveWorkflowTaskDef>[1],
): Promise<void> {
  if (!plan.steps.length) return;

  await Promise.all(
    plan.steps.map(async (step, index) => {
      const def = resolveWorkflowTaskDef(
        {
          task_key: step.key,
          label: step.label,
          sort_order: (index + 1) * 10,
        },
        scene,
      );
      await upsertWorkflowTaskRow(conversationId, runId, {
        ...def,
        status: step.status,
        skill: step.skill ?? null,
        command: step.command ?? null,
      });
    }),
  );
}

export async function updateTaskStatus(
  conversationId: string,
  runId: string,
  taskKey: string,
  status: string,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;

  await supabase
    .from("workflow_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("run_id", runId)
    .eq("task_key", taskKey);
}
