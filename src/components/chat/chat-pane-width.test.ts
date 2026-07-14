import { describe, expect, it } from "vitest";
import {
  CHAT_PANE_DEFAULT_WIDTH,
  CHAT_PANE_MAX_WIDTH,
  CHAT_PANE_MIN_WIDTH,
  clampChatPaneWidth,
} from "@/components/chat/chat-pane-width";

describe("chat-pane-width", () => {
    it("clamps to 280-800", () => {
    expect(clampChatPaneWidth(100)).toBe(CHAT_PANE_MIN_WIDTH);
    expect(clampChatPaneWidth(800)).toBe(CHAT_PANE_MAX_WIDTH);
    expect(clampChatPaneWidth(400)).toBe(400);
  });

  it("default width sits in the adjustable range", () => {
    expect(CHAT_PANE_DEFAULT_WIDTH).toBe(560);
    expect(CHAT_PANE_DEFAULT_WIDTH).toBeGreaterThanOrEqual(CHAT_PANE_MIN_WIDTH);
    expect(CHAT_PANE_DEFAULT_WIDTH).toBeLessThanOrEqual(CHAT_PANE_MAX_WIDTH);
  });
});
