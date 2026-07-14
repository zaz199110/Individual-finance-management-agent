import { resolveProviderStack } from "@/lib/config/model-providers";
import type { ModelSettingsRow, ModelSlot } from "@/lib/supabase/server";

export type ConfigSource = "saved" | "env";

export type ModelSettingsRowWithSource = ModelSettingsRow & {
  config_source: ConfigSource;
};

const ALL_SLOTS: ModelSlot[] = [
  "reasoning",
  "deep",
  "vision",
  "web",
  "embedding",
];

function defaultEmptyRow(slot: ModelSlot): ModelSettingsRow {
  return {
    slot,
    model_name: null,
    api_base_url: null,
    api_key_encrypted: null,
    use_same_as_reasoning: slot === "deep" || slot === "vision",
    check_status: "unchecked",
    last_checked_at: null,
    last_error_message: null,
  };
}

function rowHasCredentials(row: ModelSettingsRow): boolean {
  return Boolean(
    row.model_name?.trim() ||
      row.api_base_url?.trim() ||
      row.api_key_encrypted?.trim(),
  );
}

function envRowFromStack(slot: ModelSlot): ModelSettingsRow | null {
  const cfg = resolveProviderStack()[slot];
  if (!cfg) return null;
  return {
    slot,
    model_name: cfg.model_name,
    api_base_url: cfg.api_base_url,
    api_key_encrypted: cfg.api_key,
    use_same_as_reasoning: slot === "deep" || slot === "vision",
    check_status: "unchecked",
    last_checked_at: null,
    last_error_message: null,
  };
}

/** 设置页展示 / 运行时解析：已保存配置优先，否则回落 .env.local */
export function mergeModelSettingsWithEnv(
  savedRows: ModelSettingsRow[],
): ModelSettingsRowWithSource[] {
  const bySlot = new Map<ModelSlot, ModelSettingsRow>();
  for (const slot of ALL_SLOTS) {
    bySlot.set(
      slot,
      savedRows.find((r) => r.slot === slot) ?? defaultEmptyRow(slot),
    );
  }

  const merged = new Map<ModelSlot, ModelSettingsRowWithSource>();

  function mergeSlot(slot: ModelSlot): ModelSettingsRowWithSource {
    const cached = merged.get(slot);
    if (cached) return cached;

    const saved = bySlot.get(slot)!;

    if (rowHasCredentials(saved)) {
      const result: ModelSettingsRowWithSource = {
        ...saved,
        config_source: "saved",
      };
      merged.set(slot, result);
      return result;
    }

    // 深度 / 图片：优先各槽位 env（如 Mimo），独立展示与探测
    const env = envRowFromStack(slot);
    if (env && rowHasCredentials(env)) {
      const result: ModelSettingsRowWithSource = {
        ...saved,
        model_name: env.model_name,
        api_base_url: env.api_base_url,
        api_key_encrypted: env.api_key_encrypted,
        use_same_as_reasoning: false,
        config_source: "env",
      };
      merged.set(slot, result);
      return result;
    }

    if (
      (slot === "deep" || slot === "vision") &&
      saved.use_same_as_reasoning
    ) {
      const reasoning = mergeSlot("reasoning");
      const result: ModelSettingsRowWithSource = {
        ...saved,
        model_name: reasoning.model_name,
        api_base_url: reasoning.api_base_url,
        api_key_encrypted: reasoning.api_key_encrypted,
        config_source: reasoning.config_source,
      };
      merged.set(slot, result);
      return result;
    }

    const result: ModelSettingsRowWithSource = {
      ...saved,
      config_source: "saved",
    };
    merged.set(slot, result);
    return result;
  }

  return ALL_SLOTS.map(mergeSlot);
}

export function stripModelConfigSource(
  row: ModelSettingsRowWithSource,
): ModelSettingsRow {
  const { config_source: _source, ...rest } = row;
  return rest;
}

export function resolveConfigSource(
  savedPresent: boolean,
  envPresent: boolean,
): ConfigSource {
  if (savedPresent) return "saved";
  if (envPresent) return "env";
  return "saved";
}
