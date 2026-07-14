import { describe, expect, it } from "vitest";
import { createClientMessageId } from "./client-message-id";

describe("createClientMessageId", () => {
  it("generates unique ids", () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createClientMessageId("user")),
    );
    expect(ids.size).toBe(50);
  });

  it("includes role prefix", () => {
    expect(createClientMessageId("user")).toMatch(/^temp-user-/);
    expect(createClientMessageId("assistant")).toMatch(/^temp-assistant-/);
  });
});
