import { describe, expect, it, vi } from "vitest";

vi.mock("@/harness/scenes/scene_chat", () => ({
  handleSceneChat: vi.fn(async (_s, userMessage, sse, plan) => {
    sse.write("content_block", { type: "text", text: `mock:${userMessage}` });
    return {
      plan,
      assistantContent: `mock:${userMessage}`,
      contentBlocks: [{ type: "text", text: `mock:${userMessage}` }],
    };
  }),
}));

vi.mock("@/harness/scenes/scene_profile", () => ({
  handleSceneProfile: vi.fn(),
}));

vi.mock("@/harness/planner/planner", () => ({
  runPlanner: vi.fn(async () => ({
    intent: "simple_qa",
    steps: [{ key: "answer", label: "组织回答", status: "pending" }],
    requires_user_confirm: false,
  })),
  CAPABILITY_REPLY: "",
}));

function mockSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.order = ret;
  chain.limit = ret;
  chain.insert = ret;
  chain.update = ret;
  chain.upsert = ret;
  chain.maybeSingle = async () => result;
  chain.single = async () => result;
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const mockUserRow = {
  id: "msg-user-1",
  role: "user",
  content: "你好",
  conversation_id: "conv-1",
  metadata: { scene: "chat" },
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "conversations") {
        return mockSupabaseChain({
          data: {
            id: "conv-1",
            title: "新对话",
            created_at: "2025-06-20T00:00:00.000Z",
            conversation_type: "chat",
            metadata: { type_locked: false, active_tab: "chat" },
          },
          error: null,
        });
      }
      if (table === "messages") {
        const listResult = { data: [] as unknown[], error: null };
        const insertChain = mockSupabaseChain({ data: mockUserRow, error: null });
        insertChain.select = () => insertChain;
        return {
          ...mockSupabaseChain(listResult),
          insert: () => insertChain,
        };
      }
      return mockSupabaseChain({ data: { id: "msg-1" }, error: null });
    },
  })),
}));

describe("runHarnessLoop", () => {
  it("runs dispatchSceneHandler → SSE writeback", async () => {
    const { runHarnessLoop } = await import("@/harness/loop");
    const events: Array<{ event: string; data: unknown }> = [];
    const sse = {
      write(event: string, data: unknown) {
        events.push({ event, data });
      },
      close() {},
    };

    const result = await runHarnessLoop(
      { conversation_id: "conv-1", content: "你好", scene: "chat" },
      sse,
    );

    expect(result.runId).toBeTruthy();
    expect(events.some((e) => e.event === "stage")).toBe(true);
    expect(events.some((e) => e.event === "user_persisted")).toBe(true);
    expect(events.some((e) => e.event === "done")).toBe(true);
    const done = events.find((e) => e.event === "done");
    expect((done?.data as { user_message_id?: string })?.user_message_id).toBe(
      "msg-user-1",
    );
  });

  it("allows image-only messages without ERR-EMPTY", async () => {
    const { runHarnessLoop } = await import("@/harness/loop");
    const events: Array<{ event: string; data: unknown }> = [];
    const sse = {
      write(event: string, data: unknown) {
        events.push({ event, data });
      },
      close() {},
    };

    const result = await runHarnessLoop(
      {
        conversation_id: "conv-1",
        content: "",
        scene: "chat",
        attachments: [{ type: "image", mime: "image/png", data: "abc" }],
      },
      sse,
    );

    expect(result.runId).toBeTruthy();
    const errEmpty = events.find(
      (e) => e.event === "error" && (e.data as { code?: string }).code === "ERR-EMPTY",
    );
    expect(errEmpty).toBeUndefined();
  });
});
