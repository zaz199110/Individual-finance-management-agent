import { describe, expect, it } from "vitest";
import { sanitizeUserContent } from "./user-content";

describe("sanitizeUserContent", () => {
  it("strips undefined prefix", () => {
    expect(sanitizeUserContent("undefined什么是基金定投？")).toBe("什么是基金定投？");
  });

  it("trims whitespace", () => {
    expect(sanitizeUserContent("  hello  ")).toBe("hello");
  });
});
