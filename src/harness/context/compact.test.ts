import { describe, expect, it } from "vitest";
import { runCompactPipeline } from "@/harness/context/compact";
import type { MessageRow } from "@/harness/types";

function msg(id: string, content: string, role: "user" | "assistant" = "user"): MessageRow {
  return {
    id,
    conversation_id: "c1",
    role,
    content,
    created_at: "",
  };
}

describe("runCompactPipeline", () => {
  it("L3 spills large tool results", async () => {
    const big = "x".repeat(3000);
    const out = await runCompactPipeline([msg("1", big)], {
      conversationId: "c1",
      runId: "run1",
    });
    expect(out[0].content).toContain("tool_result 已落盘");
  });

  it("L1 snips middle when over threshold", async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      msg(String(i), `m${i}`),
    );
    const out = await runCompactPipeline(many, {
      conversationId: "c1",
      runId: "run1",
    });
    expect(out.length).toBeLessThan(50);
    expect(out.some((m) => m.content?.includes("省略中间"))).toBe(true);
  });
});
