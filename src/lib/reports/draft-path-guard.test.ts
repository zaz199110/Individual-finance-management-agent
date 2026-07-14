import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRunsDir } from "@/lib/paths";
import { isDraftPathInConversation } from "./draft-path-guard";

describe("isDraftPathInConversation", () => {
  const conversationId = "conv-test-001";

  it("accepts draft under conversation runs root", () => {
    const draftPath = path.join(
      getRunsDir(),
      conversationId,
      "run001",
      "draft-report.md",
    );
    expect(isDraftPathInConversation(conversationId, draftPath)).toBe(true);
  });

  it("rejects path outside conversation runs root", () => {
    const draftPath = path.join(getRunsDir(), "other-conv", "run001", "draft-report.md");
    expect(isDraftPathInConversation(conversationId, draftPath)).toBe(false);
  });

  it("rejects non draft-report filename", () => {
    const draftPath = path.join(
      getRunsDir(),
      conversationId,
      "run001",
      "secrets.txt",
    );
    expect(isDraftPathInConversation(conversationId, draftPath)).toBe(false);
  });
});
