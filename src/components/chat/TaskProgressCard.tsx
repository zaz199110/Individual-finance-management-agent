"use client";

import {
  buildCollapsedTaskSummary,
  buildVisibleTaskRows,
  resolveActiveTaskKey,
  resolveTimelineDisplayStatuses,
  type TaskTimelineDisplayStatus,
  type WorkflowTaskItem,
} from "@/lib/chat/task-progress";

interface TaskProgressCardProps {
  tasks: WorkflowTaskItem[];
  reasoningSummary?: string;
  expanded: boolean;
  streaming?: boolean;
  onToggleExpand: () => void;
}

function statusIcon(status: TaskTimelineDisplayStatus): string {
  switch (status) {
    case "done":
      return "✓";
    case "running":
      return "●";
    case "blocked":
      return "⏸";
    case "failed":
    case "cancelled":
      return "✗";
    case "pending":
      return "○";
    case "upcoming":
      return "";
    default:
      return "○";
  }
}

function statusClass(status: TaskTimelineDisplayStatus): string {
  switch (status) {
    case "done":
      return "text-green-600";
    case "running":
      return "text-blue-500";
    case "blocked":
      return "text-amber-500";
    case "failed":
    case "cancelled":
      return "text-red-500";
    case "pending":
      return "text-slate-400";
    default:
      return "text-slate-400";
  }
}

function TimelineNode({
  displayStatus,
  pulsing,
}: {
  displayStatus: TaskTimelineDisplayStatus;
  pulsing?: boolean;
}) {
  if (displayStatus === "upcoming") {
    return (
      <span
        className="absolute -left-[29px] top-[7px] z-[1] h-[18px] w-[18px]"
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`absolute -left-[29px] top-[7px] z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#f6f5f4] text-[11px] leading-none ${statusClass(displayStatus)} ${
        pulsing ? "animate-pulse" : ""
      }`}
      aria-hidden
    >
      {statusIcon(displayStatus)}
    </span>
  );
}

export function TaskProgressCard({
  tasks,
  reasoningSummary,
  expanded,
  streaming,
  onToggleExpand,
}: TaskProgressCardProps) {
  if (!tasks.length) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggleExpand}
        className="mb-3 w-full text-left border-l-2 border-[rgba(0,117,222,0.28)] pl-3.5 py-1 text-sm text-[#615d59] hover:border-[rgba(0,117,222,0.45)] hover:text-[rgba(0,0,0,0.82)] transition-colors cursor-pointer bg-transparent"
      >
        <span className="mr-1.5">▸</span>
        {buildCollapsedTaskSummary(tasks)}
      </button>
    );
  }

  const rows = buildVisibleTaskRows(tasks);
  const activeKey = resolveActiveTaskKey(tasks);
  const displayStatuses = resolveTimelineDisplayStatuses(rows, activeKey);

  return (
    <div className="mb-3 w-full">
      {!streaming && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mb-2 text-xs text-[#999] hover:text-[#615d59] bg-transparent border-0 cursor-pointer p-0"
        >
          ▾ 收起
        </button>
      )}
      <ol className="relative m-0 list-none border-l-2 border-[rgba(0,0,0,0.08)] pl-7">
        {rows.map(({ task }, index) => {
          const isLast = index === rows.length - 1;
          const displayStatus = displayStatuses[index] ?? task.status;
          const isActive = activeKey != null && task.task_key === activeKey;
          const isUpcoming = displayStatus === "upcoming";

          return (
            <li
              key={task.task_key}
              className={`relative ${isLast ? "pb-0" : "pb-2.5"}`}
            >
              <TimelineNode
                displayStatus={displayStatus}
                pulsing={isActive}
              />
              <div
                className={`text-[14px] leading-7 ${
                  isUpcoming
                    ? "text-[#c4c0bb]"
                    : isActive
                      ? "font-medium text-[rgba(0,0,0,0.92)]"
                      : "text-[#615d59]"
                }`}
              >
                <span className="break-words">{task.label}</span>
              </div>
              {isActive && reasoningSummary ? (
                <p className="mt-0.5 text-xs leading-relaxed text-[#999] break-words">
                  {reasoningSummary}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
