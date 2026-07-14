import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ExecutionPlan, QueryState, SseWriter } from "@/harness/types";

const executeToolMock = vi.fn();
const callVisionGeneralQaMock = vi.fn();

vi.mock("@/harness/tools/router", () => ({
  executeTool: (...args: unknown[]) => executeToolMock(...args),
}));

vi.mock("@/harness/tools/vision_parse", () => ({
  callVisionGeneralQa: (...args: unknown[]) => callVisionGeneralQaMock(...args),
}));

vi.mock("@/harness/hooks", () => ({
  emitHook: vi.fn(async () => ({ blocked: false })),
}));

vi.mock("@/harness/tasks/stage", () => ({
  writeStage: vi.fn(async () => {}),
}));

vi.mock("@/harness/llm/client", () => ({
  staticReply: vi.fn(async function* () {
    yield { type: "text_delta", text: "cap" };
    yield { type: "done" };
  }),
  streamChatCompletionWithRetry: vi.fn(async function* () {
    yield { type: "text_delta", text: "回答" };
    yield { type: "done" };
  }),
}));

function baseState(attachments?: QueryState["attachments"]): QueryState {
  return {
    runId: "run-1",
    conversationId: "conv-1",
    conversationType: "chat",
    scene: "chat",
    messages: [],
    plan: null,
    attachments,
  };
}

function simplePlan(): ExecutionPlan {
  return {
    intent: "simple_qa",
    steps: [{ key: "answer", label: "组织回答", status: "pending" }],
    requires_user_confirm: false,
  };
}

function mockSse(write: SseWriter["write"]): SseWriter {
  return { write, close: () => {} };
}

describe("handleSceneChat vision", () => {
  beforeEach(() => {
    executeToolMock.mockReset();
    callVisionGeneralQaMock.mockReset();
  });

  it("CH-10: holdings screenshot returns handoff card", async () => {
    executeToolMock.mockResolvedValue({
      ok: true,
      preview: "识别到 1 笔持仓",
      data: {
        positions: [
          {
            fund_code: "019305",
            fund_name: "测试基金",
            invested_at: "2024-01-01",
            paid_amount: 10000,
            shares: 0,
          },
        ],
      },
    });

    const { handleSceneChat } = await import("@/harness/scenes/scene_chat");
    const sseEvents: unknown[] = [];
    const sse = mockSse((_e, data) => {
      sseEvents.push(data);
    });

    const result = await handleSceneChat(
      baseState([{ type: "image", mime: "image/png", data: "abc" }]),
      "",
      sse,
      simplePlan(),
    );

    expect(result.contentBlocks.some((b) => b.type === "handoff_card")).toBe(true);
    expect(result.assistantContent).toContain("019305");
    expect(result.assistantContent).toContain("持仓分析");
    expect(callVisionGeneralQaMock).not.toHaveBeenCalled();
  });

  it("general image returns vision QA answer directly", async () => {
    executeToolMock.mockResolvedValue({
      ok: false,
      error: "未能从截图解析出有效持仓",
      data: { positions: [] },
    });
    callVisionGeneralQaMock.mockResolvedValue({
      ok: true,
      text: "图中是一只基金的净值走势。",
    });

    const { handleSceneChat } = await import("@/harness/scenes/scene_chat");
    const sse = mockSse(vi.fn());

    const result = await handleSceneChat(
      baseState([{ type: "image", mime: "image/jpeg", data: "xyz" }]),
      "这张图什么意思",
      sse,
      simplePlan(),
    );

    expect(callVisionGeneralQaMock).toHaveBeenCalled();
    expect(result.assistantContent).toBe("图中是一只基金的净值走势。");
  });

  it("vision failure returns explicit error without LLM hallucination", async () => {
    executeToolMock.mockResolvedValue({
      ok: false,
      error: "未能从截图解析出有效持仓",
      data: { positions: [] },
    });
    callVisionGeneralQaMock.mockResolvedValue({
      ok: false,
      error: "Vision API 401",
    });

    const { handleSceneChat } = await import("@/harness/scenes/scene_chat");
    const sse = mockSse(vi.fn());

    const result = await handleSceneChat(
      baseState([{ type: "image", mime: "image/png", data: "abc" }]),
      "",
      sse,
      simplePlan(),
    );

    expect(result.assistantContent).toContain("Vision API 401");
    expect(result.assistantContent).not.toBe("回答");
  });
});
