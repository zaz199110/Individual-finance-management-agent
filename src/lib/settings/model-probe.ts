import type { ProviderId } from "@/lib/config/model-providers";
import type { ModelSettingsRow, ModelSlot } from "@/lib/supabase/server";

export interface ModelProbeConfig {
  api_base_url: string;
  api_key: string;
  model_name: string;
  provider: ProviderId;
}

export function buildModelProbeConfig(
  slot: ModelSlot,
  row: ModelSettingsRow,
): ModelProbeConfig | null {
  if (!row.api_base_url?.trim() || !row.api_key_encrypted?.trim()) {
    return null;
  }

  const modelName =
    row.model_name?.trim() ??
    (slot === "web"
      ? "search_std"
      : slot === "embedding"
        ? "embedding-3"
        : "mimo-v2.5");

  const provider: ProviderId =
    slot === "web" && /^search_/i.test(modelName)
      ? "zhipu"
      : slot === "embedding" || /^embedding-/i.test(modelName)
        ? "zhipu"
        : "mimo";

  return {
    api_base_url: row.api_base_url.trim(),
    api_key: row.api_key_encrypted.trim(),
    model_name: modelName,
    provider,
  };
}

export function modelRowFingerprint(row: ModelSettingsRow): string {
  return [
    row.slot,
    row.model_name,
    row.api_base_url,
    row.api_key_encrypted,
  ]
    .map((p) => p?.trim() ?? "")
    .join("|");
}
