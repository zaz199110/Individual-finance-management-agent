import { describe, expect, it } from "vitest";
import { executeTool } from "@/harness/tools/router";

describe("vision_parse", () => {
  it("without images returns error prompting user to upload", async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: {},
      scene: "portfolio",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("tool is registered in router and callable", async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: { image_urls: [] },
      scene: "portfolio",
    });
    expect(typeof result.ok).toBe("boolean");
  });
});
