export type WorkflowTaskStatus =
  | "pending"
  | "running"
  | "done"
  | "blocked"
  | "cancelled"
  | "failed";

export interface WorkflowTaskItem {
  task_key: string;
  label: string;
  status: WorkflowTaskStatus;
  parent_task_key?: string | null;
  node_depth: 1 | 2;
  sort_order: number;
}

const VALID_STATUSES = new Set<WorkflowTaskStatus>([
  "pending",
  "running",
  "done",
  "blocked",
  "cancelled",
  "failed",
]);

export function normalizeWorkflowTaskStatus(status: string): WorkflowTaskStatus {
  if (VALID_STATUSES.has(status as WorkflowTaskStatus)) {
    return status as WorkflowTaskStatus;
  }
  return "pending";
}

export function parseWorkflowTaskFromStage(
  data: Record<string, unknown>,
): WorkflowTaskItem {
  return {
    task_key: String(data.task_key),
    label: String(data.label),
    status: normalizeWorkflowTaskStatus(String(data.status)),
    parent_task_key:
      data.parent_task_key != null && data.parent_task_key !== ""
        ? String(data.parent_task_key)
        : null,
    node_depth: data.node_depth === 2 ? 2 : 1,
    sort_order:
      typeof data.sort_order === "number" ? data.sort_order : Number(data.sort_order) || 0,
  };
}

export function upsertWorkflowTask(
  tasks: WorkflowTaskItem[],
  incoming: WorkflowTaskItem,
): WorkflowTaskItem[] {
  const idx = tasks.findIndex((t) => t.task_key === incoming.task_key);
  if (idx >= 0) {
    const next = [...tasks];
    next[idx] = { ...next[idx], ...incoming };
    return next;
  }
  return [...tasks, incoming];
}

export function sortWorkflowTasks(tasks: WorkflowTaskItem[]): WorkflowTaskItem[] {
  return [...tasks].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.node_depth - b.node_depth ||
      a.task_key.localeCompare(b.task_key),
  );
}

export interface VisibleTaskRow {
  task: WorkflowTaskItem;
}

/** 历史二级结构中的分组父节点：有子步骤时不再单独占一行 */
const GROUPING_PARENT_TASK_KEYS = [
  "fund.prep.enrich",
  "fund.gather",
  "fund.rpt.draft",
  "plan.s2.detail",
  "plan.rpt.draft",
  "profile.rpt.draft",
  "port.rpt.draft",
] as const;

function isGroupingParentTaskKey(taskKey: string, allKeys: Set<string>): boolean {
  if (!GROUPING_PARENT_TASK_KEYS.includes(taskKey as (typeof GROUPING_PARENT_TASK_KEYS)[number])) {
    return false;
  }
  const prefix = `${taskKey}.`;
  return [...allKeys].some((key) => key.startsWith(prefix));
}

/** 面向投资者的进度条中需要隐藏的「内部/占位/技术」步骤 */
export const INVESTOR_HIDDEN_TASK_KEYS = new Set([
  "profile.onboarding", // 由 planner 通用节点「理解对话」覆盖，避免进度条重复
  "fund.prep.enrich.fetch",
  "fund.prep.enrich.index",
  "fund.gather.profile",
  "plan.s1.allocation.web",     // 大类配置无实际公开资讯检索，隐藏内部子步骤
  "plan.s1.allocation.propose", // 大类配置方案生成子步骤，归入「进行大类资产规划」
  "plan.s2.detail.web",         // 基金明细当前无实际公开资讯检索（L0 registry 直选），对客隐藏
  "plan.s2.detail.intent",      // 确认选基场景与约束为内部步骤，归入初筛流程
  "plan.s2.detail.kb",          // 知识库核验为内部步骤，对客隐藏
]);

/** 判断是否为 profile（投资需求梳理）场景 */
function isProfileScenario(tasks: WorkflowTaskItem[]): boolean {
  return tasks.some((t) => t.task_key.startsWith("profile."));
}

/** 报告生成相关的 task_key 前缀（profile 场景仅展示报告步骤） */
const PROFILE_REPORT_PREFIX = "profile.rpt";

/** 非 profile 场景：将二级子步提升为独立一级行展示 */
function flattenTaskForDisplay(task: WorkflowTaskItem): WorkflowTaskItem {
  if (task.node_depth === 1 && !task.parent_task_key) return task;
  return {
    ...task,
    node_depth: 1,
    parent_task_key: null,
  };
}

/** 时间线展示态：upcoming = 尚未到达，不显示勾/点 */
export type TaskTimelineDisplayStatus = WorkflowTaskStatus | "upcoming";

/** Harness 预置 task_key 或通用节点；过滤 Planner LLM 杜撰的 orphan 步骤 */
const GENERIC_TASK_KEYS = new Set([
  "planner",
  "vision_parse",
  "web_search",
  "report_read",
  "capability",
  "msg-stopped",
]);

export function isKnownWorkflowTaskKey(taskKey: string): boolean {
  if (GENERIC_TASK_KEYS.has(taskKey)) return true;
  return /^(fund|plan|port|profile)\./.test(taskKey);
}

/** 当前唯一高亮步：按 sort_order 取第一个 running，再 blocked */
export function resolveActiveTaskKey(tasks: WorkflowTaskItem[]): string | null {
  const visibleKeys = new Set(
    buildVisibleTaskRows(tasks).map((row) => row.task.task_key),
  );
  const sorted = sortWorkflowTasks(
    tasks.filter(
      (t) => isKnownWorkflowTaskKey(t.task_key) && visibleKeys.has(t.task_key),
    ),
  );

  const running = sorted.find((t) => t.status === "running");
  if (running) return running.task_key;

  const blocked = sorted.find((t) => t.status === "blocked");
  if (blocked) return blocked.task_key;

  // 无 running/blocked 时回退到第一个 pending，让进度条有可感知的"当前位置"
  const pending = sorted.find((t) => t.status === "pending");
  return pending?.task_key ?? null;
}

/**
 * Cursor 式单步高亮：已完成 ✓、仅一个当前步 ●、其余留空。
 * PRD §5.3.10「仅高亮当前叶子或 running 节点」。
 *
 * 额外兜底：按顺序扫描，第一个非 done 步骤之前的所有步骤强制显示 done；
 * 之后的步骤显示 upcoming，除非后端状态是 failed/cancelled（始终原样显示）。
 * 这样可避免后端乱序 emit 导致进度条「后面绿了、中间还灰着」的跳跃。
 */
export function resolveTimelineDisplayStatuses(
  rows: VisibleTaskRow[],
  activeKey?: string | null,
): TaskTimelineDisplayStatus[] {
  if (!rows.length) return [];

  const firstNonDoneIndex = rows.findIndex(({ task }) => task.status !== "done");

  return rows.map(({ task }, index) => {
    if (task.status === "failed") return "failed";
    if (task.status === "cancelled") return "cancelled";

    if (firstNonDoneIndex === -1) {
      return "done";
    }

    if (index < firstNonDoneIndex) {
      return "done";
    }

    if (index === firstNonDoneIndex) {
      if (activeKey && task.task_key === activeKey) return "running";
      if (task.status === "blocked") return "blocked";
      if (task.status === "running") return "running";
      if (task.status === "pending") return "pending";
      return "upcoming";
    }

    return "upcoming";
  });
}

/**
 * 一级平铺：按 sort_order 展示全部步骤。
 * - profile 场景：仅展示报告生成步骤（profile.rpt.*），其余全部隐藏
 * - 其他场景：原二级子步 → 提升为独立一级行（flattenTaskForDisplay）
 * - 历史分组父节点（fund.gather 等）在已有子步时去重隐藏，避免与细步重复
 */
export function buildVisibleTaskRows(tasks: WorkflowTaskItem[]): VisibleTaskRow[] {
  const sorted = sortWorkflowTasks(
    tasks.filter((t) => isKnownWorkflowTaskKey(t.task_key)),
  );
  const allKeys = new Set(sorted.map((t) => t.task_key));
  const profileMode = isProfileScenario(tasks);

  return sorted
    .filter((t) => {
      // profile 场景：仅展示报告生成步骤 + 分组父节点去重
      if (profileMode) {
        if (!t.task_key.startsWith(PROFILE_REPORT_PREFIX)) return false;
        return !isGroupingParentTaskKey(t.task_key, allKeys);
      }
      // 其他场景：过滤隐藏任务 + 分组父节点去重
      return (
        !isGroupingParentTaskKey(t.task_key, allKeys) &&
        !INVESTOR_HIDDEN_TASK_KEYS.has(t.task_key)
      );
    })
    .map((task) => ({ task: profileMode ? task : flattenTaskForDisplay(task) }))
    .filter((row, idx, arr) => {
      const key = row.task.task_key;
      const first = arr.findIndex((r) => r.task.task_key === key);
      return first === idx;
    });
}

export function hasBlockedWorkflowTask(tasks: WorkflowTaskItem[]): boolean {
  return tasks.some((t) => t.status === "blocked");
}

export function shouldAutoCollapseTaskProgress(
  tasks: WorkflowTaskItem[],
  opts: {
    streaming?: boolean;
    stopped?: boolean;
    backgroundPending?: boolean;
  },
): boolean {
  if (opts.streaming) return false;
  if (opts.stopped) return false;
  if (opts.backgroundPending) return false;
  if (hasBlockedWorkflowTask(tasks)) return false;
  if (tasks.some((t) => t.status === "running" || t.status === "pending")) {
    return false;
  }
  const real = tasks.filter((t) => t.task_key !== "msg-stopped");
  if (!real.length) return false;
  return real.every(
    (t) =>
      t.status === "done" ||
      t.status === "failed" ||
      t.status === "cancelled",
  );
}

export function mergeWorkflowTaskLists(
  existing: WorkflowTaskItem[] | undefined,
  incoming: WorkflowTaskItem[],
): WorkflowTaskItem[] {
  let merged = existing ?? [];
  for (const task of incoming) {
    merged = upsertWorkflowTask(merged, task);
  }
  return merged;
}

export function buildCollapsedTaskSummary(tasks: WorkflowTaskItem[]): string {
  const visible = buildVisibleTaskRows(tasks).filter(
    (row) => row.task.task_key !== "msg-stopped",
  );
  const doneCount = visible.filter((row) => row.task.status === "done").length;
  const lastDone = [...visible]
    .reverse()
    .find((row) => row.task.status === "done");
  const lastLabel = lastDone?.task.label ?? "处理完成";
  return `已完成 ${doneCount} 步 · ${lastLabel}`;
}

export function parseWorkflowTasksFromMetadata(
  metadata?: Record<string, unknown> | null,
): WorkflowTaskItem[] {
  if (!metadata) return [];
  const raw = metadata.workflow_tasks_snapshot;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      typeof item === "object" && item !== null
        ? parseWorkflowTaskFromStage(item as Record<string, unknown>)
        : null,
    )
    .filter((t): t is WorkflowTaskItem => t !== null);
}

export function workflowTasksFromApiRows(
  rows: Array<Record<string, unknown>>,
): WorkflowTaskItem[] {
  return rows.map((row) =>
    parseWorkflowTaskFromStage({
      task_key: row.task_key,
      label: row.label,
      status: row.status,
      parent_task_key: row.parent_task_key,
      node_depth: row.node_depth,
      sort_order: row.sort_order,
    }),
  );
}
