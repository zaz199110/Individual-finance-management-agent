import fs from "node:fs";
import path from "node:path";
import { resolveProviderStack } from "@/lib/config/model-providers";
import { getDataDir } from "@/lib/paths";
import { getSupabase } from "@/lib/supabase/server";

export const EMBEDDING_FILTER_SETTINGS_KEY = "embedding_filter";

export interface EmbeddingFilterSettings {
  /** 用户可在设置中关闭层内 embedding 重排（不影响对话） */
  enabled: boolean;
  updated_at?: string | null;
}

function localPath(): string {
  return path.join(getDataDir(), "settings", "embedding_filter.json");
}

function readLocal(): EmbeddingFilterSettings | null {
  try {
    const p = localPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as EmbeddingFilterSettings;
  } catch {
    return null;
  }
}

function writeLocal(data: EmbeddingFilterSettings): void {
  const p = localPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

async function readStored(): Promise<EmbeddingFilterSettings> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", EMBEDDING_FILTER_SETTINGS_KEY)
      .maybeSingle();
    if (data?.value) {
      const v = data.value as EmbeddingFilterSettings;
      return { enabled: v.enabled !== false, updated_at: v.updated_at ?? null };
    }
  }
  return readLocal() ?? { enabled: false, updated_at: null };
}

export async function getEmbeddingFilterSettings(): Promise<EmbeddingFilterSettings> {
  return readStored();
}

export async function setEmbeddingFilterEnabled(
  enabled: boolean,
): Promise<EmbeddingFilterSettings> {
  const payload: EmbeddingFilterSettings = {
    enabled,
    updated_at: new Date().toISOString(),
  };
  const supabase = await getSupabase();
  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert({
      key: EMBEDDING_FILTER_SETTINGS_KEY,
      value: payload,
      updated_at: payload.updated_at,
    });
    if (error) {
      writeLocal(payload);
      return payload;
    }
  }
  writeLocal(payload);
  return payload;
}

/** 配置存在且用户未在设置中关闭 */
export async function isEmbeddingRerankEnabled(): Promise<boolean> {
  const settings = await readStored();
  if (!settings.enabled) return false;
  return resolveProviderStack().embedding != null;
}
