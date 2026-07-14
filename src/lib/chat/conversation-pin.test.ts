import { describe, expect, it } from "vitest";
import {
  applySinglePinToConversationList,
  buildPinMetadata,
  mergePinMetadata,
} from "./conversation-pin";

describe("mergePinMetadata", () => {
  it("sets pinned_at when pinning", () => {
    const meta = mergePinMetadata({ title_customized: true }, true, "2025-06-20T12:00:00.000Z");
    expect(meta.pinned).toBe(true);
    expect(meta.pinned_at).toBe("2025-06-20T12:00:00.000Z");
    expect(meta.title_customized).toBe(true);
  });

  it("clears pinned_at when unpinning", () => {
    const meta = mergePinMetadata({ pinned: true, pinned_at: "x" }, false, null);
    expect(meta.pinned).toBe(false);
    expect(meta.pinned_at).toBeNull();
  });
});

describe("buildPinMetadata", () => {
  it("returns pinned with ISO timestamp", () => {
    const meta = buildPinMetadata({}, true);
    expect(meta.pinned).toBe(true);
    expect(typeof meta.pinned_at).toBe("string");
  });
});

describe("applySinglePinToConversationList", () => {
  it("clears other pins when pinning one conversation", () => {
    const list = [
      { id: "a", metadata: { pinned: true, pinned_at: "t1" } },
      { id: "b", metadata: { pinned: false } },
    ];
    const next = applySinglePinToConversationList(list, "b", true, "t2");
    expect(next.find((c) => c.id === "a")?.metadata?.pinned).toBe(false);
    expect(next.find((c) => c.id === "b")?.metadata?.pinned).toBe(true);
  });
});
