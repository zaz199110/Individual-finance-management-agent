import { describe, expect, it, vi, afterEach } from "vitest";
import { zhipuWebSearch } from "./web-search";

describe("zhipu web-search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps search_result to summary and citations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            search_result: [
              {
                title: "示例新闻",
                content: "市场概况摘要",
                link: "https://example.com/news/1",
                media: "示例网",
              },
            ],
          }),
      }),
    );

    const result = await zhipuWebSearch({
      apiKey: "test-key",
      query: "A股热点",
      searchEngine: "search_std",
      count: 5,
    });

    expect(result.summary).toContain("示例新闻");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.url).toBe("https://example.com/news/1");
  });
});
