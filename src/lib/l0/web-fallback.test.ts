import { describe, expect, it } from "vitest";
import { appendWebFallbackToSummary } from "./web-fallback";

describe("web-fallback", () => {
  it("appends degraded marker and web summary", () => {
    const out = appendWebFallbackToSummary("L0 base", {
      web_summary: "净值 1.23",
      citations: [{ title: "来源A", url: "https://a.test" }],
    });
    expect(out).toContain("L0 降级");
    expect(out).toContain("净值 1.23");
    expect(out).toContain("来源A");
  });
});
