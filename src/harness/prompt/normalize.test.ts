import { describe, expect, it } from "vitest";
import { normalizeMessages, mergeReminders } from "@/harness/prompt/normalize";
import type { MessageRow } from "@/harness/types";

describe("normalizeMessages", () => {
  it("filters empty and maps user/assistant rows", () => {
    const rows: MessageRow[] = [
      {
        id: "1",
        conversation_id: "c",
        role: "user",
        content: "你好",
        created_at: "",
      },
      {
        id: "2",
        conversation_id: "c",
        role: "assistant",
        content: "您好",
        created_at: "",
      },
      {
        id: "3",
        conversation_id: "c",
        role: "system",
        content: "hidden",
        created_at: "",
      },
    ];
    const out = normalizeMessages(rows);
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe("user");
  });

  it("marks spilled tool results with placeholder", () => {
    const rows: MessageRow[] = [
      {
        id: "1",
        conversation_id: "c",
        role: "assistant",
        content: "result",
        metadata: { tool_result_spilled: true },
        created_at: "",
      },
    ];
    const out = normalizeMessages(rows);
    expect(out[0].content).toContain("tool-results");
  });
});

describe("mergeReminders", () => {
  it("appends reminders section", () => {
    const merged = mergeReminders("system", ["提醒 A"]);
    expect(merged).toContain("本轮提醒");
    expect(merged).toContain("提醒 A");
  });
});
