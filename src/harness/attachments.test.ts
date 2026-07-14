import { describe, expect, it } from "vitest";
import { attachmentsToImageUrls } from "@/harness/attachments";

describe("attachmentsToImageUrls", () => {
  it("converts base64 attachment to data URL", () => {
    const urls = attachmentsToImageUrls([
      { type: "image", mime: "image/png", data: "abc123" },
    ]);
    expect(urls).toEqual(["data:image/png;base64,abc123"]);
  });

  it("keeps http URL as-is", () => {
    const urls = attachmentsToImageUrls([
      { type: "image", url: "https://example.com/a.png" },
    ]);
    expect(urls).toEqual(["https://example.com/a.png"]);
  });

  it("returns empty for missing attachments", () => {
    expect(attachmentsToImageUrls()).toEqual([]);
    expect(attachmentsToImageUrls([])).toEqual([]);
  });
});
