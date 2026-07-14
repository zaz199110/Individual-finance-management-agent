import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageRow } from "@/harness/types";
import { getDataDir } from "@/lib/paths";
import {
  appendTranscript,
  getTranscriptPath,
  readTranscriptEntries,
} from "./transcript";
import { estimateMessagesTokens } from "./token-estimate";
import { compactL4IfNeeded, resetCompactFailureCount } from "./compact-history";

vi.mock("@/lib/llm/invoke", () => ({
  completeText: vi.fn(async () => "用户正在梳理投资需求，已完成基本信息确认。"),
}));

vi.mock("@/lib/config/model-providers", () => ({
  listReasoningCandidates: vi.fn(() => [
    {
      provider: "mimo",
      model_name: "mimo-v2.5",
      api_base_url: "https://example.com",
      api_key: "test",
    },
  ]),
}));

function msg(id: string, content: string): MessageRow {
  return {
    id,
    conversation_id: "conv-l4",
    role: "user",
    content,
    created_at: new Date().toISOString(),
  };
}

describe("transcript", () => {
  const convId = "conv-transcript-test";

  afterEach(() => {
    const p = getTranscriptPath(convId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("appends jsonl entries", () => {
    appendTranscript(convId, [msg("1", "hello"), msg("2", "world")]);
    const entries = readTranscriptEntries(convId);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.content).toBe("hello");
    expect(entries[1]?.content).toBe("world");
    expect(fs.existsSync(path.join(getDataDir(), "transcripts"))).toBe(true);
  });
});

describe("token estimate", () => {
  it("estimates non-zero for text", () => {
    expect(estimateMessagesTokens([msg("1", "x".repeat(3500))])).toBeGreaterThan(
      900,
    );
  });
});

describe("compactL4IfNeeded", () => {
  const convId = "conv-l4-test";
  const prevThreshold = process.env.HARNESS_AUTO_COMPACT_THRESHOLD;
  const prevSkip = process.env.HARNESS_SKIP_L4;
  const prevMin = process.env.HARNESS_MIN_COMPACT_SAVINGS;

  afterEach(() => {
    if (prevThreshold === undefined) delete process.env.HARNESS_AUTO_COMPACT_THRESHOLD;
    else process.env.HARNESS_AUTO_COMPACT_THRESHOLD = prevThreshold;
    if (prevSkip === undefined) delete process.env.HARNESS_SKIP_L4;
    else process.env.HARNESS_SKIP_L4 = prevSkip;
    if (prevMin === undefined) delete process.env.HARNESS_MIN_COMPACT_SAVINGS;
    else process.env.HARNESS_MIN_COMPACT_SAVINGS = prevMin;
    resetCompactFailureCount(convId);
    const p = getTranscriptPath(convId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("skips when below threshold", async () => {
    process.env.HARNESS_AUTO_COMPACT_THRESHOLD = "999999";
    const messages = [msg("1", "short")];
    const out = await compactL4IfNeeded(messages, {
      conversationId: convId,
      runId: "run1",
    });
    expect(out.l4Applied).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it("writes transcript and compacts when over threshold", async () => {
    process.env.HARNESS_AUTO_COMPACT_THRESHOLD = "100";
    process.env.HARNESS_MIN_COMPACT_SAVINGS = "50";
    delete process.env.HARNESS_SKIP_L4;

    const messages = [msg("1", "x".repeat(5000)), msg("2", "y".repeat(5000))];
    const out = await compactL4IfNeeded(messages, {
      conversationId: convId,
      runId: "run1",
      scene: "profile",
    });

    expect(out.l4Applied).toBe(true);
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]?.content).toContain("[Compacted]");
    expect(readTranscriptEntries(convId).length).toBeGreaterThan(0);
  });
});
