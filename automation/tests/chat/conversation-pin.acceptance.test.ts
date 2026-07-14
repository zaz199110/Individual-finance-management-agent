/**
 * CH-PIN-01 · 单置顶（全局互斥）
 * 运行：npm test -- automation/tests/chat/conversation-pin.acceptance.test.ts
 */
import { describe, expect, it } from "vitest";
import { applySinglePinToConversationList } from "@/lib/chat/conversation-pin";
import { sortConversationsForSidebar } from "@/components/chat/conversation-sidebar";

type Conv = {
  id: string;
  title: string;
  updated_at: string;
  metadata?: { pinned?: boolean; pinned_at?: string | null };
};

const makeConv = (
  id: string,
  title: string,
  updated_at: string,
  pinned = false,
  pinned_at?: string | null,
): Conv => ({
  id,
  title,
  updated_at,
  metadata: pinned ? { pinned: true, pinned_at: pinned_at ?? updated_at } : { pinned: false },
});

describe("CH-PIN-01 single global pin", () => {
  it("pin B unpins previously pinned A", () => {
    const list: Conv[] = [
      makeConv("a", "A", "2025-06-20T10:00:00.000Z", true, "2025-06-20T09:00:00.000Z"),
      makeConv("b", "B", "2025-06-20T11:00:00.000Z"),
    ];
    const next = applySinglePinToConversationList(list, "b", true, "2025-06-20T12:00:00.000Z");
    expect(next.find((c) => c.id === "a")?.metadata?.pinned).toBe(false);
    expect(next.find((c) => c.id === "b")?.metadata?.pinned).toBe(true);
  });

  it("unpin B leaves none pinned", () => {
    const list: Conv[] = [
      makeConv("b", "B", "2025-06-20T11:00:00.000Z", true, "2025-06-20T12:00:00.000Z"),
    ];
    const next = applySinglePinToConversationList(list, "b", false, null);
    expect(next.every((c) => !c.metadata?.pinned)).toBe(true);
  });

  it("sort: pinned first, then updated_at desc among unpinned", () => {
    const list: Conv[] = [
      makeConv("recent", "recent", "2025-06-20T15:00:00.000Z"),
      makeConv("older", "older", "2025-06-19T10:00:00.000Z"),
      makeConv("pinned", "pinned", "2025-06-18T08:00:00.000Z", true, "2025-06-20T08:00:00.000Z"),
    ];
    const sorted = sortConversationsForSidebar(list);
    expect(sorted.map((c) => c.id)).toEqual(["pinned", "recent", "older"]);
  });

  it("only one pinned after sequential pin toggles in list state", () => {
    let list: Conv[] = [
      makeConv("a", "A", "2025-06-20T10:00:00.000Z"),
      makeConv("b", "B", "2025-06-20T11:00:00.000Z"),
    ];
    list = applySinglePinToConversationList(list, "a", true, "2025-06-20T09:00:00.000Z");
    list = applySinglePinToConversationList(list, "b", true, "2025-06-20T12:00:00.000Z");
    const pinned = list.filter((c) => c.metadata?.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe("b");
  });
});
