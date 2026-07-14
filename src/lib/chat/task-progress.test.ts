import { describe, expect, it } from "vitest";
import {
  buildCollapsedTaskSummary,
  buildVisibleTaskRows,
  isKnownWorkflowTaskKey,
  mergeWorkflowTaskLists,
  resolveActiveTaskKey,
  resolveTimelineDisplayStatuses,
  shouldAutoCollapseTaskProgress,
  sortWorkflowTasks,
  upsertWorkflowTask,
  type WorkflowTaskItem,
} from "./task-progress";

const fundFullTasks: WorkflowTaskItem[] = [
  {
    task_key: "fund.prep.lookup",
    label: "确认基金档案与类型",
    status: "done",
    node_depth: 1,
    sort_order: 20,
  },
  {
    task_key: "fund.gather.l0",
    label: "拉取行情与持仓",
    status: "done",
    node_depth: 1,
    sort_order: 70,
  },
  {
    task_key: "fund.gather.l1",
    label: "检索披露文件",
    status: "running",
    node_depth: 1,
    sort_order: 80,
  },
  {
    task_key: "fund.rpt.draft.compose",
    label: "撰写基金解读报告",
    status: "pending",
    node_depth: 1,
    sort_order: 110,
  },
];

describe("resolveTimelineDisplayStatuses", () => {
  it("marks only completed steps done; current active; later empty", () => {
    const rows = buildVisibleTaskRows([
      {
        task_key: "fund.prep.lookup",
        label: "确认基金档案与类型",
        status: "done",
        node_depth: 1,
        sort_order: 20,
      },
      {
        task_key: "fund.gather.l0",
        label: "拉取行情与持仓",
        status: "done",
        node_depth: 1,
        sort_order: 70,
      },
      {
        task_key: "fund.rpt.draft.compose",
        label: "撰写基金解读报告",
        status: "failed",
        node_depth: 1,
        sort_order: 110,
      },
      {
        task_key: "fund.rpt.wait",
        label: "等待您确认发布",
        status: "pending",
        node_depth: 1,
        sort_order: 130,
      },
    ]);
    const display = resolveTimelineDisplayStatuses(rows);
    expect(display[display.length - 2]).toBe("failed");
    expect(display[display.length - 1]).toBe("upcoming");
  });

  it("highlights the current running flat step", () => {
    const rows = buildVisibleTaskRows(fundFullTasks);
    const activeKey = resolveActiveTaskKey(fundFullTasks);
    const display = resolveTimelineDisplayStatuses(rows, activeKey);
    const l0 = rows.findIndex((r) => r.task.task_key === "fund.gather.l0");
    const l1 = rows.findIndex((r) => r.task.task_key === "fund.gather.l1");
    const draft = rows.findIndex((r) => r.task.task_key === "fund.rpt.draft.compose");
    expect(activeKey).toBe("fund.gather.l1");
    expect(display[l0]).toBe("done");
    expect(display[l1]).toBe("running");
    expect(display[draft]).toBe("upcoming");
  });

  it("shows only one running indicator when multiple steps are pending", () => {
    const tasks: WorkflowTaskItem[] = [
      ...fundFullTasks,
      {
        task_key: "fund.gather.l3",
        label: "联网检索公开资料",
        status: "pending",
        node_depth: 1,
        sort_order: 85,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const display = resolveTimelineDisplayStatuses(rows, resolveActiveTaskKey(tasks));
    const runningCount = display.filter((s) => s === "running").length;
    expect(runningCount).toBe(1);
  });

  it("filters orphan planner task keys from visible rows", () => {
    const withOrphan: WorkflowTaskItem[] = [
      {
        task_key: "fund_full_report",
        label: "重新生成完整基金解读报告",
        status: "pending",
        node_depth: 1,
        sort_order: 5,
      },
      ...fundFullTasks,
    ];
    const keys = buildVisibleTaskRows(withOrphan).map((r) => r.task.task_key);
    expect(keys).not.toContain("fund_full_report");
    expect(isKnownWorkflowTaskKey("fund_full_report")).toBe(false);
    expect(isKnownWorkflowTaskKey("fund.gather.l1")).toBe(true);
    expect(isKnownWorkflowTaskKey("vision_parse")).toBe(true);
  });

  it("shows vision_parse in timeline during image analysis", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "planner",
        label: "理解对话",
        status: "running",
        node_depth: 1,
        sort_order: 0,
      },
      {
        task_key: "vision_parse",
        label: "识别图片",
        status: "running",
        node_depth: 1,
        sort_order: 3,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).toEqual(["planner", "vision_parse"]);
  });

  it("does not jump when a later task is done while an earlier task is still pending", () => {
    const rows = buildVisibleTaskRows([
      {
        task_key: "port.prep.read",
        label: "读取当前持仓",
        status: "pending",
        node_depth: 1,
        sort_order: 10,
      },
      {
        task_key: "port.rpt.draft.compose",
        label: "撰写分析导语与要点",
        status: "done",
        node_depth: 1,
        sort_order: 40,
      },
    ]);
    const display = resolveTimelineDisplayStatuses(rows);
    // 第一个 pending 步骤现在正确显示为 "pending"（○ 图标），不再隐藏为 "upcoming"
    expect(display).toEqual(["pending", "upcoming"]);
  });
});

describe("buildVisibleTaskRows", () => {
  it("shows all flat steps in sort order", () => {
    const rows = buildVisibleTaskRows(fundFullTasks);
    const keys = rows.map((r) => r.task.task_key);
    expect(keys).toEqual([
      "fund.prep.lookup",
      "fund.gather.l0",
      "fund.gather.l1",
      "fund.rpt.draft.compose",
    ]);
  });

  it("includes pending siblings in the flat list", () => {
    const tasks: WorkflowTaskItem[] = [
      ...fundFullTasks,
      {
        task_key: "fund.gather.l3",
        label: "联网检索公开资料",
        status: "pending",
        node_depth: 1,
        sort_order: 85,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).toContain("fund.gather.l3");
  });

  it.skip("hides level-2 sub-steps completely instead of flattening", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "fund.gather",
        label: "检索基金资料",
        status: "done",
        node_depth: 1,
        sort_order: 60,
      },
      {
        task_key: "fund.gather.l0",
        label: "拉取行情与持仓",
        status: "done",
        parent_task_key: "fund.gather",
        node_depth: 2,
        sort_order: 70,
      },
      {
        task_key: "fund.gather.l1",
        label: "检索披露文件",
        status: "running",
        parent_task_key: "fund.gather",
        node_depth: 2,
        sort_order: 80,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const keys = rows.map((r) => r.task.task_key);
    // level-2 sub-steps are completely hidden
    expect(keys).not.toContain("fund.gather.l0");
    expect(keys).not.toContain("fund.gather.l1");
    // level-1 task is shown
    expect(keys).toEqual(["fund.gather"]);
  });

  it("dedupes grouping parent when finer flat sub-steps exist", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "plan.s1.allocation",
        label: "确定资产配置大类",
        status: "pending",
        node_depth: 1,
        sort_order: 40,
      },
      {
        task_key: "plan.s1.allocation.align",
        label: "对齐您的投资需求",
        status: "running",
        node_depth: 1,
        sort_order: 41,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).toContain("plan.s1.allocation");       // 顶层「进行大类资产规划」保持可见
    expect(keys).toContain("plan.s1.allocation.align"); // align 未在隐藏名单中，正常展示
  });

  it("hides plan.s1 allocation sub-steps from investors", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "plan.s1.allocation",
        label: "进行大类资产规划",
        status: "running",
        node_depth: 1,
        sort_order: 40,
      },
      {
        task_key: "plan.s1.allocation.web",
        label: "检索大类配置公开资讯",
        status: "done",
        node_depth: 1,
        sort_order: 41,
      },
      {
        task_key: "plan.s1.allocation.propose",
        label: "生成大类配置方案",
        status: "done",
        node_depth: 1,
        sort_order: 42,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).toContain("plan.s1.allocation");         // 父节点可见
    expect(keys).not.toContain("plan.s1.allocation.web");     // 隐藏：无实际公开资讯检索
    expect(keys).not.toContain("plan.s1.allocation.propose"); // 隐藏：归入父节点
  });

  it("dedupes plan.s2.detail when detail sub-steps are present", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "plan.s2.detail",
        label: "确定基金明细与执行安排",
        status: "pending",
        node_depth: 1,
        sort_order: 80,
      },
      {
        task_key: "plan.s2.detail.screen",
        label: "全市场初筛候选基金",
        status: "done",
        node_depth: 1,
        sort_order: 84,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).not.toContain("plan.s2.detail");
    expect(keys).toContain("plan.s2.detail.screen");
  });

  it("hides internal/placeholder tasks from investors", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "fund.prep.lookup",
        label: "确认基金档案与类型",
        status: "done",
        node_depth: 1,
        sort_order: 40,
      },
      {
        task_key: "fund.prep.enrich.fetch",
        label: "拉取近一年公开资料",
        status: "done",
        node_depth: 1,
        sort_order: 60,
      },
      {
        task_key: "fund.prep.enrich.index",
        label: "更新搜索索引",
        status: "done",
        node_depth: 1,
        sort_order: 70,
      },
      {
        task_key: "fund.gather.profile",
        label: "（进度占位）",
        status: "done",
        node_depth: 1,
        sort_order: 85,
      },
      {
        task_key: "fund.gather.l0",
        label: "拉取行情与持仓",
        status: "running",
        node_depth: 1,
        sort_order: 90,
      },
    ];
    const keys = buildVisibleTaskRows(tasks).map((r) => r.task.task_key);
    expect(keys).toEqual(["fund.prep.lookup", "fund.gather.l0"]);
  });

  it("resolves active task correctly after internal tasks are filtered", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "fund.prep.lookup",
        label: "确认基金档案与类型",
        status: "done",
        node_depth: 1,
        sort_order: 40,
      },
      {
        task_key: "fund.prep.enrich.fetch",
        label: "拉取近一年公开资料",
        status: "done",
        node_depth: 1,
        sort_order: 60,
      },
      {
        task_key: "fund.prep.enrich.index",
        label: "更新搜索索引",
        status: "done",
        node_depth: 1,
        sort_order: 70,
      },
      {
        task_key: "fund.gather.l0",
        label: "拉取行情与持仓",
        status: "running",
        node_depth: 1,
        sort_order: 90,
      },
    ];
    expect(resolveActiveTaskKey(tasks)).toBe("fund.gather.l0");
  });

  it("shows clean sequential timeline when enrich steps are skipped/done", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "fund.prep.lookup",
        label: "确认基金档案与类型",
        status: "done",
        node_depth: 1,
        sort_order: 40,
      },
      {
        task_key: "fund.prep.l0_sync",
        label: "同步行情、费率与持仓",
        status: "done",
        node_depth: 1,
        sort_order: 50,
      },
      {
        task_key: "fund.prep.enrich.fetch",
        label: "拉取近一年公开资料",
        status: "done",
        node_depth: 1,
        sort_order: 60,
      },
      {
        task_key: "fund.prep.enrich.index",
        label: "更新搜索索引",
        status: "done",
        node_depth: 1,
        sort_order: 70,
      },
      {
        task_key: "fund.gather.l0",
        label: "拉取行情与持仓",
        status: "running",
        node_depth: 1,
        sort_order: 90,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const keys = rows.map((r) => r.task.task_key);
    expect(keys).toEqual(["fund.prep.lookup", "fund.prep.l0_sync", "fund.gather.l0"]);
    const display = resolveTimelineDisplayStatuses(rows, resolveActiveTaskKey(tasks));
    expect(display).toEqual(["done", "done", "running"]);
  });

  it("dedupes duplicate task keys keeping the first by sort order", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "fund.basic",
        label: "基本信息",
        status: "done",
        node_depth: 1,
        sort_order: 10,
      },
      {
        task_key: "fund.goal",
        label: "目标梳理",
        status: "running",
        node_depth: 1,
        sort_order: 20,
      },
      {
        task_key: "fund.goal",
        label: "目标梳理",
        status: "done",
        node_depth: 1,
        sort_order: 30,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const keys = rows.map((r) => r.task.task_key);
    expect(keys).toEqual(["fund.basic", "fund.goal"]);
    expect(rows).toHaveLength(2);
    expect(rows[1].task.status).toBe("running");
  });

  // ── profile mode: grouping parent dedup + sub-task visibility ──
  it("hides profile.rpt.draft parent when sub-tasks exist (profile mode)", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft",
        label: "生成投资需求报告",
        status: "running",
        node_depth: 1,
        sort_order: 30,
      },
      {
        task_key: "profile.rpt.draft.gather",
        label: "获取需求数据",
        status: "done",
        parent_task_key: "profile.rpt.draft",
        node_depth: 2,
        sort_order: 31,
      },
      {
        task_key: "profile.rpt.draft.compose",
        label: "生成各场景报告",
        status: "pending",
        parent_task_key: "profile.rpt.draft",
        node_depth: 2,
        sort_order: 32,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const keys = rows.map((r) => r.task.task_key);
    // parent hidden, sub-tasks visible
    expect(keys).not.toContain("profile.rpt.draft");
    expect(keys).toContain("profile.rpt.draft.gather");
    expect(keys).toContain("profile.rpt.draft.compose");
  });

  it("shows profile.rpt.draft parent when NO sub-tasks seeded yet", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft",
        label: "生成投资需求报告",
        status: "running",
        node_depth: 1,
        sort_order: 30,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const keys = rows.map((r) => r.task.task_key);
    expect(keys).toEqual(["profile.rpt.draft"]);
  });
});

describe("resolveActiveTaskKey", () => {
  it("returns running task when present", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft.gather",
        label: "获取需求数据",
        status: "done",
        node_depth: 1,
        sort_order: 31,
      },
      {
        task_key: "profile.rpt.draft.compose",
        label: "生成各场景报告",
        status: "running",
        node_depth: 1,
        sort_order: 32,
      },
      {
        task_key: "profile.rpt.draft.cross",
        label: "跨场景综合分析",
        status: "pending",
        node_depth: 1,
        sort_order: 33,
      },
    ];
    expect(resolveActiveTaskKey(tasks)).toBe("profile.rpt.draft.compose");
  });

  it("falls back to first pending when no running or blocked", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft.gather",
        label: "获取需求数据",
        status: "done",
        node_depth: 1,
        sort_order: 31,
      },
      {
        task_key: "profile.rpt.draft.compose",
        label: "生成各场景报告",
        status: "pending",
        node_depth: 1,
        sort_order: 32,
      },
      {
        task_key: "profile.rpt.draft.cross",
        label: "跨场景综合分析",
        status: "pending",
        node_depth: 1,
        sort_order: 33,
      },
    ];
    // should return first pending (compose), not null
    expect(resolveActiveTaskKey(tasks)).toBe("profile.rpt.draft.compose");
  });

  it("returns null when all tasks are done", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft.gather",
        label: "获取需求数据",
        status: "done",
        node_depth: 1,
        sort_order: 31,
      },
      {
        task_key: "profile.rpt.draft.compose",
        label: "生成各场景报告",
        status: "done",
        node_depth: 1,
        sort_order: 32,
      },
    ];
    expect(resolveActiveTaskKey(tasks)).toBeNull();
  });
});

describe("resolveTimelineDisplayStatuses — pending", () => {
  it("shows first pending step as 'pending' and later steps as 'upcoming'", () => {
    const tasks: WorkflowTaskItem[] = [
      {
        task_key: "profile.rpt.draft.gather",
        label: "获取需求数据",
        status: "pending",
        node_depth: 1,
        sort_order: 31,
      },
      {
        task_key: "profile.rpt.draft.compose",
        label: "生成各场景报告",
        status: "pending",
        node_depth: 1,
        sort_order: 32,
      },
    ];
    const rows = buildVisibleTaskRows(tasks);
    const display = resolveTimelineDisplayStatuses(rows);
    // first non-done is "pending"; all later steps are "upcoming" regardless of their real status
    expect(display).toEqual(["pending", "upcoming"]);
  });
});

describe("shouldAutoCollapseTaskProgress", () => {
  it("stays expanded while tasks are still running", () => {
    expect(shouldAutoCollapseTaskProgress(fundFullTasks, { streaming: false })).toBe(
      false,
    );
  });

  it("stays expanded while background job is pending", () => {
    const done = fundFullTasks.map((t) => ({ ...t, status: "done" as const }));
    expect(
      shouldAutoCollapseTaskProgress(done, {
        streaming: false,
        backgroundPending: true,
      }),
    ).toBe(false);
  });

  it("collapses after all tasks terminal when not streaming", () => {
    const done = fundFullTasks.map((t) => ({ ...t, status: "done" as const }));
    expect(shouldAutoCollapseTaskProgress(done, { streaming: false })).toBe(true);
  });

  it("stays expanded while streaming", () => {
    expect(shouldAutoCollapseTaskProgress(fundFullTasks, { streaming: true })).toBe(false);
  });

  it("stays expanded when blocked", () => {
    const blocked = [
      ...fundFullTasks,
      {
        task_key: "fund.rpt.wait",
        label: "等待您确认发布",
        status: "blocked" as const,
        node_depth: 1 as const,
        sort_order: 130,
      },
    ];
    expect(shouldAutoCollapseTaskProgress(blocked, { streaming: false })).toBe(false);
  });

  it("stays expanded when stopped", () => {
    expect(
      shouldAutoCollapseTaskProgress(fundFullTasks, { streaming: false, stopped: true }),
    ).toBe(false);
  });
});

describe("buildCollapsedTaskSummary", () => {
  it("uses done count and last done label", () => {
    const tasks = sortWorkflowTasks(
      fundFullTasks.map((t) => ({ ...t, status: "done" as const })),
    );
    expect(buildCollapsedTaskSummary(tasks)).toBe(
      "已完成 4 步 · 撰写基金解读报告",
    );
  });
});

describe("mergeWorkflowTaskLists", () => {
  it("upserts incoming tasks onto existing list", () => {
    const merged = mergeWorkflowTaskLists(fundFullTasks, [
      {
        task_key: "fund.gather.l1",
        label: "检索披露文件",
        status: "done",
        node_depth: 1,
        sort_order: 80,
      },
    ]);
    expect(merged.find((t) => t.task_key === "fund.gather.l1")?.status).toBe("done");
    expect(merged.length).toBe(fundFullTasks.length);
  });
});

describe("upsertWorkflowTask", () => {
  it("merges by task_key", () => {
    const base = [fundFullTasks[0]];
    const next = upsertWorkflowTask(base, {
      ...fundFullTasks[0],
      status: "running",
    });
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("running");
  });
});
