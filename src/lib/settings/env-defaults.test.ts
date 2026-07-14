import { afterEach, describe, expect, it } from "vitest";
import type { ModelSettingsRow } from "@/lib/supabase/server";
import { mergeModelSettingsWithEnv } from "./env-defaults";

const ENV_KEYS = [
  "MIMO_API_URL",
  "MIMO_API_KEY",
  "MIMO_MODEL_NAME",
  "ZHIPU_API_KEY",
  "ZHIPU_WEB_SEARCH_ENGINE",
  "ZHIPU_EMBEDDING_MODEL",
] as const;

describe("mergeModelSettingsWithEnv", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
    {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function setEnv(key: (typeof ENV_KEYS)[number], value: string) {
    if (!(key in saved)) saved[key] = process.env[key];
    process.env[key] = value;
  }

  const emptyRows: ModelSettingsRow[] = [
    "reasoning",
    "deep",
    "vision",
    "web",
    "embedding",
  ].map((slot) => ({
    slot: slot as ModelSettingsRow["slot"],
    model_name: null,
    api_base_url: null,
    api_key_encrypted: null,
    use_same_as_reasoning: slot === "deep" || slot === "vision",
    check_status: "unchecked" as const,
    last_checked_at: null,
    last_error_message: null,
  }));

  it("fills empty slots from .env.local", () => {
    setEnv("MIMO_API_URL", "https://token-plan-cn.xiaomimimo.com/anthropic");
    setEnv("MIMO_API_KEY", "mimo-key");
    setEnv("MIMO_MODEL_NAME", "mimo-v2.5");
    setEnv("ZHIPU_API_KEY", "zhipu-key");
    setEnv("ZHIPU_WEB_SEARCH_ENGINE", "search_std");
    setEnv("ZHIPU_EMBEDDING_MODEL", "embedding-3");

    const merged = mergeModelSettingsWithEnv(emptyRows);

    expect(merged.find((r) => r.slot === "reasoning")).toMatchObject({
      model_name: "mimo-v2.5",
      config_source: "env",
    });
    expect(merged.find((r) => r.slot === "web")).toMatchObject({
      model_name: "search_std",
      use_same_as_reasoning: false,
      config_source: "env",
    });
    expect(merged.find((r) => r.slot === "deep")).toMatchObject({
      model_name: "mimo-v2.5",
      use_same_as_reasoning: false,
      config_source: "env",
    });
    expect(merged.find((r) => r.slot === "vision")).toMatchObject({
      model_name: "mimo-v2.5",
      use_same_as_reasoning: false,
      config_source: "env",
    });
  });

  it("prefers saved credentials over env", () => {
    setEnv("MIMO_API_KEY", "env-key");
    const savedRows: ModelSettingsRow[] = emptyRows.map((row) =>
      row.slot === "reasoning"
        ? {
            ...row,
            model_name: "saved-model",
            api_base_url: "https://saved.example/v1",
            api_key_encrypted: "saved-key",
          }
        : row,
    );

    const merged = mergeModelSettingsWithEnv(savedRows);
    expect(merged.find((r) => r.slot === "reasoning")).toMatchObject({
      model_name: "saved-model",
      config_source: "saved",
    });
  });
});
