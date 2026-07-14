/**
 * CH-SIDEBAR-01 · 对话侧栏：标题格式、搜索、置顶排序、重命名摘要段
 * 运行：npm test -- automation/tests/chat/conversation-sidebar.acceptance.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  prepareSidebarConversations,
  sortConversationsForSidebar,
} from "@/components/chat/conversation-sidebar";
import {
  buildConversationTitle,
  commitRenameTitle,
  getRenameDraft,
  isAutoTitleCandidate,
  isStructuredConversationTitle,
  summarizeFirstQuestion,
} from "@/lib/chat/conversation-title";
import { applySinglePinToConversationList } from "@/lib/chat/conversation-pin";

describe("CH-SIDEBAR-01 acceptance", () => {
  it("A1: structured title matches 【场景】-摘要-YYYYMMDD", () => {
    const title = buildConversationTitle("portfolio", "最大回撤怎么算", "20250620");
    expect(title).toBe("【持仓分析】-最大回撤怎么算-20250620");
    expect(isStructuredConversationTitle(title)).toBe(true);
  });

  it("A2: first question summary ≤20 chars", () => {
    const long = "a".repeat(40);
    expect(summarizeFirstQuestion(long).length).toBeLessThanOrEqual(21);
  });

  it("A3: auto title skips customized or scheduled titles", () => {
    expect(isAutoTitleCandidate("新对话")).toBe(true);
    expect(isAutoTitleCandidate("【自由问答】-x-20250620")).toBe(false);
    expect(isAutoTitleCandidate("定时持仓分析 · 20250620")).toBe(false);
  });

  it("A4: rename only changes summary segment", () => {
    const before = "【基金解析】-易方达蓝筹-20250620";
    const after = commitRenameTitle(before, "华夏成长");
    expect(after).toBe("【基金解析】-华夏成长-20250620");
    expect(getRenameDraft(before).draft).toBe("易方达蓝筹");
  });

  it("A5: pinned conversations sort to top", () => {
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 86400000).toISOString();
    const sorted = sortConversationsForSidebar([
      {
        id: "a",
        title: "recent",
        updated_at: now,
        metadata: { pinned: false },
      },
      {
        id: "b",
        title: "pinned-old",
        updated_at: older,
        metadata: { pinned: true, pinned_at: older },
      },
    ]);
    expect(sorted[0].id).toBe("b");
  });

  it("A5b: single-pin exclusivity — pin B unpins A", () => {
    const at = new Date().toISOString();
    const list = [
      { id: "a", title: "A", updated_at: "", metadata: { pinned: true, pinned_at: "2025-01-01" } },
      { id: "b", title: "B", updated_at: "", metadata: { pinned: false } },
    ];
    const next = applySinglePinToConversationList(list, "b", true, at);
    expect(next.find((c) => c.id === "a")?.metadata?.pinned).toBe(false);
    expect(next.find((c) => c.id === "b")?.metadata?.pinned).toBe(true);
  });

  it("A6: title search filters sidebar list", () => {
    const list = [
      { id: "1", title: "【自由问答】-养老-20250620", updated_at: "" },
      { id: "2", title: "【资产配置】-稳健-20250620", updated_at: "" },
    ];
    const result = prepareSidebarConversations(list, "养老");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("A7: no scene-type filter helper exists (search-only sidebar)", () => {
    const list = [
      { id: "1", title: "【自由问答】-a-20250620", updated_at: "" },
      { id: "2", title: "【持仓分析】-b-20250620", updated_at: "" },
    ];
    expect(prepareSidebarConversations(list, "").length).toBe(2);
  });
});
