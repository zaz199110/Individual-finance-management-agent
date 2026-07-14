import { describe, expect, it, vi, afterEach } from "vitest";
import { zhipuEmbed } from "./embedding";

describe("zhipu embedding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns embedding vector from API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
          }),
      }),
    );

    const vector = await zhipuEmbed({
      apiKey: "test-key",
      input: "hello",
      model: "embedding-3",
    });

    expect(vector).toEqual([0.1, 0.2, 0.3]);
  });
});
