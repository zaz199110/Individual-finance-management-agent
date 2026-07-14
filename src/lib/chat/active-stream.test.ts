import { describe, expect, it, beforeEach } from "vitest";
import type { ChatMessage } from "@/components/chat/types";
import {
  canStartStream,
  clearLiveStreamBuffer,
  finishStreamSession,
  getLiveStreamBuffer,
  isSendBlockedForConversation,
  isStreamActive,
  isStreamOwner,
  patchLiveStreamBuffer,
  resetActiveStreamState,
  setLiveStreamBuffer,
  startStreamSession,
} from "./active-stream";

describe("active-stream", () => {
  beforeEach(() => {
    resetActiveStreamState();
  });

  it("tracks a single active stream session", () => {
    const abort = new AbortController();
    startStreamSession("conv-a", "asst-1", abort);
    expect(isStreamActive()).toBe(true);
    expect(isStreamOwner("conv-a")).toBe(true);
    expect(isStreamOwner("conv-b")).toBe(false);
    finishStreamSession("conv-a");
    expect(isStreamActive()).toBe(false);
  });

  it("blocks send on other conversations while streaming", () => {
    startStreamSession("conv-a", "asst-1", new AbortController());
    expect(isSendBlockedForConversation("conv-b")).toBe(true);
    expect(isSendBlockedForConversation("conv-a")).toBe(false);
  });

  it("canStartStream allows same conv retry but not another conv", () => {
    startStreamSession("conv-a", "asst-1", new AbortController());
    expect(canStartStream("conv-a")).toBe(true);
    expect(canStartStream("conv-b")).toBe(false);
  });

  it("keeps per-conversation live buffers isolated", () => {
    setLiveStreamBuffer("conv-a", [
      { id: "1", role: "user", content: "hi" },
    ]);
    patchLiveStreamBuffer("conv-a", (prev) => [
      ...prev,
      { id: "2", role: "assistant", content: "...", streaming: true },
    ]);
    expect(getLiveStreamBuffer("conv-a")).toHaveLength(2);
    expect(getLiveStreamBuffer("conv-b")).toBeNull();
    clearLiveStreamBuffer("conv-a");
    expect(getLiveStreamBuffer("conv-a")).toBeNull();
  });

  it("uses initial snapshot only when buffer is empty (avoids strict-mode double append)", () => {
    const userMsg = { id: "temp-user-1", role: "user" as const, content: "hi" };
    const assistantMsg = {
      id: "temp-assistant-1",
      role: "assistant" as const,
      content: "",
      streaming: true,
    };
    const appendOptimistic = (prev: ChatMessage[]) => [
      ...prev,
      userMsg,
      assistantMsg,
    ];

    const first = patchLiveStreamBuffer("conv-a", appendOptimistic, []);
    expect(first).toHaveLength(2);
    expect(first.map((m) => m.id)).toEqual(["temp-user-1", "temp-assistant-1"]);

    // Re-applying the same append on an existing buffer duplicates (old setState-updater bug).
    const duplicated = patchLiveStreamBuffer("conv-a", appendOptimistic);
    expect(duplicated).toHaveLength(4);
    expect(new Set(duplicated.map((m) => m.id)).size).toBe(2);
  });
});
