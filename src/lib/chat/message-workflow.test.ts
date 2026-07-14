import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/components/chat/types";
import {
  applyAssistantStreamContent,
  applyDoneEventToMessages,
  applyUserPersistedToMessages,
  enrichApiMessagesWithWorkflowTasks,
  hydrateWorkflowTasksBatch,
  isAssistantWaitingForResponse,
  isTaskProgressExpanded,
  mergeConversationMessages,
  messageNeedsWorkflowTaskHydration,
  messagesNeedWorkflowTaskHydration,
} from "./message-workflow";

describe("isAssistantWaitingForResponse", () => {
  it("is true for empty streaming assistant placeholder", () => {
    expect(
      isAssistantWaitingForResponse({
        id: "a1",
        role: "assistant",
        content: "",
        streaming: true,
      }),
    ).toBe(true);
  });

  it("is false once workflow tasks or content arrive", () => {
    expect(
      isAssistantWaitingForResponse({
        id: "a1",
        role: "assistant",
        content: "",
        streaming: true,
        workflowTasks: [
          {
            task_key: "t1",
            label: "理解问题",
            status: "running",
            node_depth: 1,
            sort_order: 0,
          },
        ],
      }),
    ).toBe(false);
    expect(
      isAssistantWaitingForResponse({
        id: "a1",
        role: "assistant",
        content: "hello",
        streaming: true,
      }),
    ).toBe(false);
  });
});

describe("isTaskProgressExpanded", () => {
  it("auto-collapses when workflow tasks finished and not streaming", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "answer",
      workflowTasks: [
        {
          task_key: "t1",
          label: "理解问题",
          status: "done",
          node_depth: 1,
          sort_order: 0,
        },
      ],
    };
    expect(isTaskProgressExpanded(message)).toBe(false);
  });
});

describe("applyAssistantStreamContent", () => {
  const base: ChatMessage[] = [
    { id: "u1", role: "user", content: "hi" },
    { id: "a1", role: "assistant", content: "" },
  ];

  it("updates matching assistant content and marks streaming", () => {
    const next = applyAssistantStreamContent(base, "a1", "hello", []);
    expect(next[1]).toMatchObject({
      id: "a1",
      content: "hello",
      streaming: true,
    });
    expect(next[0]).toEqual(base[0]);
  });
});

describe("mergeConversationMessages", () => {
  it("drops optimistic temp-user when server persisted the same content", () => {
    const local = [
      { id: "temp-user-1", role: "user" as const, content: "我要梳理我的投资需求" },
      {
        id: "real-a",
        role: "assistant" as const,
        content: "好的",
        streaming: false,
      },
    ];
    const server = [
      { id: "srv-u1", role: "user" as const, content: "我要梳理我的投资需求" },
      { id: "real-a", role: "assistant" as const, content: "好的" },
    ];
    const merged = mergeConversationMessages(local, server);
    expect(merged.filter((m) => m.role === "user")).toHaveLength(1);
    expect(merged.find((m) => m.role === "user")?.id).toBe("srv-u1");
  });

  it("collapses temp-user and persisted user with same content (merge fallback)", () => {
    const local = [
      { id: "temp-user-abc", role: "user" as const, content: "我要梳理投资需求" },
      { id: "temp-a", role: "assistant" as const, content: "...", streaming: false },
    ];
    const server = [
      { id: "srv-u1", role: "user" as const, content: "我要梳理投资需求" },
      { id: "temp-a", role: "assistant" as const, content: "..." },
    ];
    const merged = mergeConversationMessages(local, server);
    expect(merged.filter((m) => m.role === "user")).toHaveLength(1);
    expect(merged.find((m) => m.role === "user")?.id).toBe("srv-u1");
  });
});

describe("applyUserPersistedToMessages", () => {
  it("replaces temp-user id with server message id", () => {
    const messages = [
      { id: "temp-user-1", role: "user" as const, content: "你好" },
      { id: "temp-a", role: "assistant" as const, content: "", streaming: true },
    ];
    const next = applyUserPersistedToMessages(messages, "temp-user-1", "srv-u1");
    expect(next[0].id).toBe("srv-u1");
    expect(next).toHaveLength(2);
  });

  it("removes temp-user when server id already present", () => {
    const messages = [
      { id: "temp-user-1", role: "user" as const, content: "你好" },
      { id: "srv-u1", role: "user" as const, content: "你好" },
    ];
    const next = applyUserPersistedToMessages(messages, "temp-user-1", "srv-u1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("srv-u1");
  });
});

describe("applyDoneEventToMessages", () => {
  const streaming: ChatMessage[] = [
    { id: "temp-a", role: "assistant", content: "answer", streaming: true },
  ];

  it("finalizes streaming and replaces temp id with server message_id", () => {
    const { messages, assistantId } = applyDoneEventToMessages(
      streaming,
      "temp-a",
      { message_id: "real-a", run_id: "run-1" },
      "已停止",
    );
    expect(assistantId).toBe("real-a");
    expect(messages[0]).toMatchObject({
      id: "real-a",
      runId: "run-1",
      streaming: false,
      content: "answer",
    });
  });
});

describe("enrichApiMessagesWithWorkflowTasks", () => {
  it("attaches workflow_tasks_snapshot for assistant messages missing snapshot", () => {
    const messages = [
      { id: "u1", role: "user", content: "hi", metadata: null },
      {
        id: "a1",
        role: "assistant",
        content: "answer",
        metadata: { run_id: "run-1" },
      },
    ];
    const enriched = enrichApiMessagesWithWorkflowTasks(messages, [
      {
        run_id: "run-1",
        task_key: "t1",
        label: "步骤一",
        status: "done",
        parent_task_key: null,
        node_depth: 1,
        sort_order: 1,
      },
    ]);
    expect(messageNeedsWorkflowTaskHydration(messages[1])).toBe(true);
    expect(messagesNeedWorkflowTaskHydration(messages)).toBe(true);
    const metadata = enriched[1].metadata as Record<string, unknown> | null | undefined;
    const snapshot = metadata?.workflow_tasks_snapshot as
      | Array<Record<string, unknown>>
      | undefined;
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot).toHaveLength(1);
    expect(snapshot?.[0]).toMatchObject({ task_key: "t1", label: "步骤一" });
  });

  it("hydrates ack messages from background_run_id instead of stream run_id", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        content: "报告正在后台生成",
        metadata: {
          run_id: "stream-run",
          background_run_id: "bg-run",
        },
      },
    ];
    const enriched = enrichApiMessagesWithWorkflowTasks(messages, [
      {
        run_id: "bg-run",
        task_key: "fund.prep.intent",
        label: "理解您的解读需求",
        status: "running",
        parent_task_key: null,
        node_depth: 1,
        sort_order: 10,
      },
    ]);
    const metadata = enriched[0].metadata as Record<string, unknown> | null | undefined;
    const snapshot = metadata?.workflow_tasks_snapshot as
      | Array<Record<string, unknown>>
      | undefined;
    expect(snapshot?.[0]).toMatchObject({
      task_key: "fund.prep.intent",
      status: "running",
    });
  });

  it("skips messages that already have workflow_tasks_snapshot", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        content: "answer",
        metadata: {
          run_id: "run-1",
          workflow_tasks_snapshot: [
            {
              task_key: "existing",
              label: "已有",
              status: "done",
              node_depth: 1,
              sort_order: 0,
            },
          ],
        },
      },
    ];
    const enriched = enrichApiMessagesWithWorkflowTasks(messages, [
      {
        run_id: "run-1",
        task_key: "t1",
        label: "步骤一",
        status: "done",
        parent_task_key: null,
        node_depth: 1,
        sort_order: 1,
      },
    ]);
    expect(enriched[0].metadata?.workflow_tasks_snapshot).toEqual(
      messages[0].metadata?.workflow_tasks_snapshot,
    );
  });
});

describe("hydrateWorkflowTasksBatch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps tasks_by_run_id onto messages in one request", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks_by_run_id: {
          "run-1": [
            {
              task_key: "t1",
              label: "步骤一",
              status: "done",
              node_depth: 1,
              sort_order: 1,
            },
          ],
        },
      }),
    }) as typeof fetch;

    const messages = [
      {
        id: "a1",
        role: "assistant" as const,
        content: "hi",
        runId: "run-1",
      },
    ];

    const hydrated = await hydrateWorkflowTasksBatch("conv-1", messages);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/conversations/conv-1/workflow-tasks",
    );
    expect(hydrated[0].workflowTasks).toHaveLength(1);
    expect(hydrated[0].workflowTasks?.[0]).toMatchObject({
      task_key: "t1",
      label: "步骤一",
    });
  });
});
