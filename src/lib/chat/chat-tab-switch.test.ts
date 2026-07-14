import { describe, expect, it } from "vitest";
import {
  decideLockedTabSwitch,
  isPreviewingOtherScene,
  lockedTabCreateConfirmMessage,
  shouldUseLockedTabSwitch,
} from "./chat-tab-switch";

describe("CH-TAB-01: shouldUseLockedTabSwitch", () => {
  it("unlocked conversation allows free tab preview", () => {
    expect(
      shouldUseLockedTabSwitch({
        typeLocked: false,
        messageCount: 0,
        currentType: "chat",
        targetTab: "plan",
      }),
    ).toBe(false);
  });

  it("empty conversation skips confirm even if type_locked was wrongly set", () => {
    expect(
      shouldUseLockedTabSwitch({
        typeLocked: true,
        messageCount: 0,
        currentType: "profile",
        targetTab: "plan",
      }),
    ).toBe(false);
  });

  it("locked conversation with messages triggers CH-TAB-01 on send", () => {
    expect(
      shouldUseLockedTabSwitch({
        typeLocked: true,
        messageCount: 2,
        currentType: "chat",
        targetTab: "plan",
      }),
    ).toBe(true);
  });

  it("tab preview on locked conversation does not imply send-time switch", () => {
    expect(
      isPreviewingOtherScene({
        typeLocked: true,
        conversationType: "chat",
        activeTab: "plan",
        messageCount: 2,
      }),
    ).toBe(true);
    expect(
      isPreviewingOtherScene({
        typeLocked: true,
        conversationType: "chat",
        activeTab: "chat",
        messageCount: 2,
      }),
    ).toBe(false);
  });

  it("same tab never triggers CH-TAB-01", () => {
    expect(
      shouldUseLockedTabSwitch({
        typeLocked: true,
        messageCount: 3,
        currentType: "plan",
        targetTab: "plan",
      }),
    ).toBe(false);
  });
});

describe("CH-TAB-01: locked tab switch", () => {  it("creates silently when target scene has no history", () => {
    expect(decideLockedTabSwitch(false)).toBe("create");
  });

  it("asks before create when target scene has history", () => {
    expect(decideLockedTabSwitch(true)).toBe("confirm_then_maybe_create");
  });

  it("confirm message mentions sidebar fallback", () => {
    const msg = lockedTabCreateConfirmMessage("基金解析");
    expect(msg).toContain("基金解析");
    expect(msg).toContain("侧栏");
  });
});
