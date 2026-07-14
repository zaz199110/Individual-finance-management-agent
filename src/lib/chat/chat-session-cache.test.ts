import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findConversationTabHint,
  getCachedConversationSnapshot,
  getCachedConversations,
  resolveConversationActiveTab,
  subscribeChatSessionCache,
  writeConversationSnapshot,
  writeConversationsList,
} from "./chat-session-cache";

function installSessionStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe("chat-session-cache", () => {
  beforeEach(() => {
    installSessionStorageMock();
    sessionStorage.clear();
  });

  it("round-trips conversation list", () => {
    writeConversationsList([
      {
        id: "c1",
        title: "测试",
        conversation_type: "chat",
        updated_at: "2026-01-01T00:00:00Z",
        metadata: {},
      },
    ]);
    expect(getCachedConversations()).toHaveLength(1);
    expect(getCachedConversations()[0].id).toBe("c1");
  });

  it("stores messages without streaming flag", () => {
    writeConversationSnapshot("c1", {
      activeTab: "chat",
      messages: [
        { id: "a1", role: "assistant", content: "hi", streaming: true },
      ],
    });
    const snap = getCachedConversationSnapshot("c1");
    expect(snap?.messages[0]).toEqual({ id: "a1", role: "assistant", content: "hi" });
    expect(snap?.activeTab).toBe("chat");
  });

  it("resolves active tab from sidebar metadata before API load", () => {
    writeConversationsList([
      {
        id: "c-profile",
        title: "需求梳理",
        conversation_type: "profile",
        updated_at: "2026-01-01T00:00:00Z",
        metadata: { type_locked: true, active_tab: "chat" },
      },
    ]);
    const list = getCachedConversations();
    expect(resolveConversationActiveTab(list[0])).toBe("profile");
    expect(findConversationTabHint("c-profile", list)).toBe("profile");
    expect(findConversationTabHint("missing", list)).toBeNull();
  });

  it("notifies subscribers when cache is written", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatSessionCache(listener);
    writeConversationsList([
      {
        id: "c2",
        title: "新",
        conversation_type: "chat",
        updated_at: "2026-01-02T00:00:00Z",
        metadata: {},
      },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeConversationsList([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
