import { NextRequest, NextResponse } from "next/server";
import { probeOpenAICompatible } from "@/lib/config/model-providers";
import { buildModelProbeConfig } from "@/lib/settings/model-probe";
import { getSupabase, resolveModelSlot } from "@/lib/supabase/server";
import type { ModelSlot } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { slot: ModelSlot };
  const slot = body.slot;

  if (!slot) {
    return NextResponse.json({ ok: false, message: "缺少 slot 参数。" }, { status: 400 });
  }

  const row = await resolveModelSlot(slot);
  const cfg = row ? buildModelProbeConfig(slot, row) : null;
  if (!cfg) {
    return NextResponse.json({
      ok: false,
      message: "请先填写并保存接口地址与访问密钥。",
    });
  }

  const { ok, message } = await probeOpenAICompatible(cfg);

  const supabase = await getSupabase();
  if (supabase) {
    await supabase
      .from("model_settings")
      .update({
        model_name: cfg.model_name,
        api_base_url: cfg.api_base_url,
        api_key_encrypted: cfg.api_key,
        check_status: ok ? "passed" : "failed",
        last_checked_at: new Date().toISOString(),
        last_error_message: ok ? null : message,
        updated_at: new Date().toISOString(),
      })
      .eq("slot", slot);
  }

  return NextResponse.json({ ok, message });
}
