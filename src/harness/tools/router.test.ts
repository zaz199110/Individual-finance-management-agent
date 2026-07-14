import { describe, expect, it } from "vitest";
import { executeTool } from "./router";

describe("tool router gaps Q7", () => {
  it("vision_parse without images returns error prompting upload", async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: {},
      scene: "portfolio",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/上传|截图/);
  });

  it("vision_parse tool is registered and callable", async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: { image_urls: [] },
      scene: "portfolio",
    });
    // Should return a result (ok or not) without throwing
    expect(typeof result.ok).toBe("boolean");
  });
});
