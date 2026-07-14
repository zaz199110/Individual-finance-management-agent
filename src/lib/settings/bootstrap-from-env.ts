import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveProviderStack } from "@/lib/config/model-providers";
import { seedDatabaseFromEnvIfEmpty } from "@/lib/settings/database";
import { seedTushareFromEnvIfEmpty } from "@/lib/settings/datasources";
import type { ModelSlot } from "@/lib/supabase/server";

const ALL_MODEL_SLOTS: ModelSlot[] = [
  "reasoning",
  "deep",
  "vision",
  "web",
  "embedding",
];

function bootstrapSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function hasModelCredentials(row: {
  api_base_url?: string | null;
  api_key_encrypted?: string | null;
}): boolean {
  return Boolean(
    row.api_base_url?.trim() && row.api_key_encrypted?.trim(),
  );
}

async function seedModelSettingsFromEnvIfEmpty(
  client: SupabaseClient,
): Promise<string[]> {
  const seeded: string[] = [];
  const stack = resolveProviderStack();
  const { data: existing } = await client.from("model_settings").select("*");
  const rows = existing ?? [];

  for (const slot of ALL_MODEL_SLOTS) {
    const row = rows.find((r) => r.slot === slot);
    if (row && hasModelCredentials(row)) continue;

    const cfg = stack[slot];
    if (!cfg) continue;

    await client
      .from("model_settings")
      .update({
        model_name: cfg.model_name,
        api_base_url: cfg.api_base_url,
        api_key_encrypted: cfg.api_key,
        use_same_as_reasoning: false,
        check_status: "unchecked",
        last_checked_at: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("slot", slot);

    seeded.push(`model:${slot}`);
  }

  return seeded;
}

/** 配置表缺省时，将 .env.local 写入 model_settings / app_settings（幂等） */
export async function bootstrapSettingsFromEnv(): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];
  const client = bootstrapSupabase();
  if (client) {
    seeded.push(...(await seedModelSettingsFromEnvIfEmpty(client)));
  }
  if (await seedDatabaseFromEnvIfEmpty()) seeded.push("database");
  if (await seedTushareFromEnvIfEmpty()) seeded.push("datasource:tushare");
  return { seeded };
}
