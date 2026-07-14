import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchScenePlaceholder,
  invalidateScenePlaceholder,
} from "@/lib/chat/placeholder-cache";

describe("placeholder-cache", () => {
  beforeEach(() => {
    invalidateScenePlaceholder();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          title: "测试标题",
          empty_body: "测试正文",
          hint: "测试提示",
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches placeholder responses within TTL", async () => {
    const first = await fetchScenePlaceholder("plan");
    const second = await fetchScenePlaceholder("plan");

    expect(first).toEqual({
      title: "测试标题",
      body: "测试正文",
      hint: "测试提示",
    });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches after invalidation", async () => {
    await fetchScenePlaceholder("profile");
    invalidateScenePlaceholder("profile");
    await fetchScenePlaceholder("profile");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
