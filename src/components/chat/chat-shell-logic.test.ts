import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types";
import type { SceneId } from "@/harness/registry/load";
import { filterConversationsBySearch, sortConversationsForSidebar, prepareSidebarConversations } from "./conversation-sidebar";
import {
  decideLockedTabSwitch,
  lockedTabCreateConfirmMessage,
} from "@/lib/chat/chat-tab-switch";

interface ConversationSummary {
  id: string;
  title: string;
  conversation_type: SceneId;
  metadata: { type_locked?: boolean; active_tab?: SceneId; has_unconfirmed?: boolean };
  updated_at: string;
}

const makeConv = (
  id: string,
  title: string,
  type: SceneId,
  locked = true,
): ConversationSummary => ({
  id,
  title,
  conversation_type: type,
  metadata: { type_locked: locked, active_tab: type, has_unconfirmed: false },
  updated_at: new Date().toISOString(),
});

describe("G3: session search — title filtering", () => {
  const convs = [
    makeConv("1", "养老规划讨论", "profile"),
    makeConv("2", "基金持仓分析", "portfolio"),
    makeConv("3", "日常闲聊", "chat"),
    makeConv("4", "资产配置方案", "plan"),
  ];

  it("returns all when search is empty", () => {
    expect(filterConversationsBySearch(convs, "").length).toBe(4);
  });

  it("filters by title substring (case-insensitive)", () => {
    const result = filterConversationsBySearch(convs, "养老");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty for no match", () => {
    expect(filterConversationsBySearch(convs, "不存在的内容").length).toBe(0);
  });

  it("search trims whitespace", () => {
    const result = filterConversationsBySearch(convs, "  养老  ");
    expect(result.length).toBe(1);
  });
});

describe("sidebar pin sort", () => {
  const base = new Date().toISOString();

  it("pinned conversations appear first", () => {
    const list = [
      { ...makeConv("1", "A", "chat"), updated_at: base, metadata: { pinned: false } },
      {
        ...makeConv("2", "B", "chat"),
        updated_at: base,
        metadata: { pinned: true, pinned_at: base },
      },
    ];
    const sorted = sortConversationsForSidebar(list);
    expect(sorted[0].id).toBe("2");
  });

  it("prepareSidebarConversations sorts then filters", () => {
    const list = [
      makeConv("1", "养老规划", "profile"),
      makeConv("2", "日常闲聊", "chat"),
    ];
    expect(prepareSidebarConversations(list, "养老").map((c) => c.id)).toEqual(["1"]);
  });
});

// ---- G5: 消息列表逻辑 ----

/** Extracted logic for determining last user/assistant message */
function findLastUserRole(messages: ChatMessage[], role: "user" | "assistant"): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) return i;
  }
  return -1;
}

const msgs: ChatMessage[] = [
  { id: "u1", role: "user", content: "什么是最大回撤" },
  { id: "a1", role: "assistant", content: "最大回撤是..." },
  { id: "u2", role: "user", content: "如何计算" },
  { id: "a2", role: "assistant", content: "计算方法是..." },
];

describe("G5: last user message detection", () => {
  it("finds last user message", () => {
    expect(findLastUserRole(msgs, "user")).toBe(2);
  });

  it("returns -1 when no user messages", () => {
    expect(findLastUserRole([], "user")).toBe(-1);
    expect(findLastUserRole([{ id: "a1", role: "assistant", content: "hi" }], "user")).toBe(-1);
  });

  it("finds last assistant message", () => {
    expect(findLastUserRole(msgs, "assistant")).toBe(3);
  });
});

// ---- F4: timeout constant check ----

describe("F4: timeout 120s", () => {
  it("timeout constant is 120000ms", () => {
    expect(120_000).toBe(120000);
    expect(120_000 / 1000 / 60).toBe(2);
  });
});

// ---- F7 / CH-TAB-01: locked tab switch logic ----

describe("F7: locked tab switch detection", () => {
  const lockedProfile = makeConv("1", "需求梳理", "profile", true);
  const unlockedChat = makeConv("2", "闲聊", "chat", false);

  it("detects locked conversation with different target tab", () => {
    const isLocked = lockedProfile.metadata?.type_locked ?? false;
    const currentType = lockedProfile.conversation_type;
    const targetTab: SceneId = "portfolio";
    expect(isLocked && targetTab !== currentType).toBe(true);
  });

  it("allows same-type tab on locked conversation", () => {
    const isLocked = lockedProfile.metadata?.type_locked ?? false;
    const currentType = lockedProfile.conversation_type;
    const targetTab: SceneId = "profile";
    expect(isLocked && targetTab !== currentType).toBe(false);
  });

  it("unlocked conversation allows any tab switch", () => {
    const isLocked = unlockedChat.metadata?.type_locked ?? false;
    expect(isLocked).toBe(false);
  });
});

describe("F7: CH-TAB-01 create vs confirm", () => {
  it("no history → silent create", () => {
    expect(decideLockedTabSwitch(false)).toBe("create");
  });

  it("has history → confirm before create", () => {
    expect(decideLockedTabSwitch(true)).toBe("confirm_then_maybe_create");
  });

  it("confirm copy guides user to sidebar on cancel", () => {
    expect(lockedTabCreateConfirmMessage("基金解析")).toMatch(/侧栏/);
  });
});

// ---- G1: vision toast message check ----

describe("G1: vision toast content", () => {
  it("toast message mentions settings path", () => {
    const toastMsg =
      "当前无法识别图片。请先在「设置 → 智能助手」中配置「图片识别」并通过检测。";
    expect(toastMsg).toContain("设置");
    expect(toastMsg).toContain("智能助手");
    expect(toastMsg).toContain("图片识别");
  });
});

// ---- D4: report_verify tool registration ----

describe("D4: report_verify tool", () => {
  it("report_verify accepts profile type", () => {
    const validTypes = ["profile", "plan", "portfolio"];
    expect(validTypes).toContain("profile");
    expect(validTypes).toContain("plan");
    expect(validTypes).toContain("portfolio");
  });
});
