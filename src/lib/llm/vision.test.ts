import { describe, expect, it } from "vitest";
import {
  buildAnthropicVisionContent,
  buildOpenAIVisionContent,
} from "@/lib/llm/vision";

describe("vision content blocks", () => {
  it("builds anthropic blocks from data URL", () => {
    const blocks = buildAnthropicVisionContent("识别图片", [
      "data:image/png;base64,abc123",
    ]);
    expect(blocks[0]).toEqual({ type: "text", text: "识别图片" });
    expect(blocks[1]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "abc123",
      },
    });
  });

  it("builds openai blocks with image_url", () => {
    const url = "data:image/jpeg;base64,xyz";
    const blocks = buildOpenAIVisionContent("hello", [url]);
    expect(blocks[1]).toEqual({
      type: "image_url",
      image_url: { url },
    });
  });
});
