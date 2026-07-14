import { NextRequest, NextResponse } from "next/server";
import { getEmbeddingFilterSettings,
  setEmbeddingFilterEnabled,
} from "@/lib/embedding/settings";
import { maskSecret } from "@/lib/settings/mask";
import { getPublicModelSettings, getSupabase } from "@/lib/supabase/server";
import type { ModelSettingsRow, ModelSlot } from "@/lib/supabase/server";

function toPublicSlot(row: ModelSettingsRow & { config_source?: string }) {
  const { api_key_encrypted, config_source, ...rest } = row;
  return {
    ...rest,
    api_key_masked: maskSecret(api_key_encrypted),
    has_api_key: Boolean(api_key_encrypted),
    config_source: config_source ?? "saved",
  };
}

export async function GET() {
  const [slots, embedding_filter] = await Promise.all([
    getPublicModelSettings(),
    getEmbeddingFilterSettings(),
  ]);
  return NextResponse.json({
    slots: slots.map(toPublicSlot),
    embedding_filter,
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    slot?: ModelSlot;
    model_name?: string;
    api_base_url?: string;
    api_key_encrypted?: string;
    use_same_as_reasoning?: boolean;
    /** 仅 embedding：关闭层内语义筛选（EMB-FILTER-01） */
    embedding_enabled?: boolean;
  };

  if (body.embedding_enabled !== undefined && !body.slot) {
    const embedding_filter = await setEmbeddingFilterEnabled(body.embedding_enabled);
    return NextResponse.json({ embedding_filter });
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "请先完成「我的数据」连接配置" }, { status: 503 });
  }

  if (!body.slot) {
    return NextResponse.json({ error: "缺少 slot" }, { status: 400 });
  }

  if (body.slot === "embedding" && body.embedding_enabled !== undefined) {
    await setEmbeddingFilterEnabled(body.embedding_enabled);
  }

  const patch: Record<string, unknown> = {
    check_status: "unchecked",
    last_checked_at: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (body.model_name !== undefined) patch.model_name = body.model_name;
  if (body.api_base_url !== undefined) patch.api_base_url = body.api_base_url;
  if (body.api_key_encrypted !== undefined) {
    patch.api_key_encrypted = body.api_key_encrypted;
  }
  if (body.use_same_as_reasoning !== undefined) {
    patch.use_same_as_reasoning = body.use_same_as_reasoning;
  }

  const { data, error } = await supabase
    .from("model_settings")
    .update(patch)
    .eq("slot", body.slot)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const embedding_filter = await getEmbeddingFilterSettings();
  return NextResponse.json({ slot: toPublicSlot(data as ModelSettingsRow), embedding_filter });
}
