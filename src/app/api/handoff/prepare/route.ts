import { NextRequest, NextResponse } from "next/server";
import { resolveHandoffTarget } from "@/lib/handoff/resolve-target";
import { updateHandoffCardStatus } from "@/lib/handoff/message-cards";
import { getSupabase } from "@/lib/supabase/server";
import type { SceneId } from "@/harness/registry/load";

const VALID_SCENES: SceneId[] = ["chat", "profile", "plan", "portfolio", "fund"];

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    source_conversation_id?: string;
    target_scene?: SceneId;
    handoff_card_message_id?: string;
  };

  if (!body.source_conversation_id || !body.target_scene) {
    return NextResponse.json(
      { error: "缺少 source_conversation_id 或 target_scene" },
      { status: 400 },
    );
  }

  if (!VALID_SCENES.includes(body.target_scene) || body.target_scene === "chat") {
    return NextResponse.json({ error: "无效的目标场景" }, { status: 400 });
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { data: source } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", body.source_conversation_id)
    .maybeSingle();

  if (!source) {
    return NextResponse.json({ error: "源对话不存在" }, { status: 404 });
  }

  try {
    const result = await resolveHandoffTarget(supabase, body.target_scene);

    if (body.handoff_card_message_id) {
      await updateHandoffCardStatus(body.handoff_card_message_id, "accepted");
    }

    return NextResponse.json({
      target_conversation_id: result.target_conversation_id,
      target_scene: result.target_scene,
      source_conversation_id: body.source_conversation_id,
      created: result.created,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Handoff 准备失败" },
      { status: 500 },
    );
  }
}
