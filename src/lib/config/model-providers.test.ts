import { describe, expect, it, afterEach } from "vitest";
import { resolveProviderStack } from "./model-providers";

const TEST_KEYS = [
  "MIMO_API_URL",
  "MIMO_API_KEY",
  "MIMO_MODEL_NAME",
  "ZHIPU_API_KEY",
  "ZHIPU_WEB_SEARCH_ENGINE",
  "ZHIPU_EMBEDDING_MODEL",
] as const;

describe("resolveProviderStack defaults", () => {
  const saved: Partial<Record<(typeof TEST_KEYS)[number], string>> = {};

  afterEach(() => {
    for (const key of TEST_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function setEnv(key: (typeof TEST_KEYS)[number], value: string) {
    if (!(key in saved)) saved[key] = process.env[key];
    process.env[key] = value;
  }

  it("uses Mimo for reasoning, deep, and vision", () => {
    setEnv("MIMO_API_URL", "https://token-plan-cn.xiaomimimo.com/anthropic");
    setEnv("MIMO_API_KEY", "mimo-key");
    setEnv("MIMO_MODEL_NAME", "mimo-v2.5");
    setEnv("ZHIPU_API_KEY", "zhipu-key");
    setEnv("ZHIPU_WEB_SEARCH_ENGINE", "search_std");

    const stack = resolveProviderStack();
    expect(stack.reasoning?.model_name).toBe("mimo-v2.5");
    expect(stack.deep).toEqual(stack.reasoning);
    expect(stack.vision).toEqual(stack.reasoning);
  });

  it("uses Zhipu Search-Std for web without Mimo fallback", () => {
    setEnv("MIMO_API_URL", "https://token-plan-cn.xiaomimimo.com/anthropic");
    setEnv("MIMO_API_KEY", "mimo-key");
    setEnv("ZHIPU_API_KEY", "zhipu-key");
    setEnv("ZHIPU_WEB_SEARCH_ENGINE", "search_std");

    const stack = resolveProviderStack();
    expect(stack.web?.provider).toBe("zhipu");
    expect(stack.web?.model_name).toBe("search_std");
  });

  it("enables embedding only when ZHIPU_EMBEDDING_MODEL is set", () => {
    setEnv("ZHIPU_API_KEY", "zhipu-key");
    setEnv("ZHIPU_EMBEDDING_MODEL", "embedding-3");

    expect(resolveProviderStack().embedding?.model_name).toBe("embedding-3");

    if (!("ZHIPU_EMBEDDING_MODEL" in saved)) saved.ZHIPU_EMBEDDING_MODEL = process.env.ZHIPU_EMBEDDING_MODEL;
    delete process.env.ZHIPU_EMBEDDING_MODEL;
    expect(resolveProviderStack().embedding).toBeNull();
  });
});
