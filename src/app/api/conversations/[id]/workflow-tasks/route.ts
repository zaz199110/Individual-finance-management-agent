import { NextRequest, NextResponse } from "next/server";
import { workflowTasksFromApiRows } from "@/lib/chat/task-progress";
import { getSupabase } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const runId = request.nextUrl.searchParams.get("run_id");

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  if (!runId) {
    const { data, error } = await supabase
      .from("workflow_tasks")
      .select(
        "run_id, task_key, label, status, parent_task_key, node_depth, sort_order",
      )
      .eq("conversation_id", id)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rowsByRunId = new Map<string, Array<Record<string, unknown>>>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const rid = typeof row.run_id === "string" ? row.run_id : "";
      if (!rid) continue;
      const list = rowsByRunId.get(rid) ?? [];
      list.push(row);
      rowsByRunId.set(rid, list);
    }

    const tasksByRunId: Record<string, ReturnType<typeof workflowTasksFromApiRows>> =
      {};
    for (const [rid, rows] of rowsByRunId) {
      tasksByRunId[rid] = workflowTasksFromApiRows(rows);
    }

    return NextResponse.json({ tasks_by_run_id: tasksByRunId });
  }

  const { data, error } = await supabase
    .from("workflow_tasks")
    .select("task_key, label, status, parent_task_key, node_depth, sort_order")
    .eq("conversation_id", id)
    .eq("run_id", runId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tasks: workflowTasksFromApiRows((data ?? []) as Array<Record<string, unknown>>),
  });
}
