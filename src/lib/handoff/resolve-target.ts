import type { SupabaseClient } from "@supabase/supabase-js";
import type { SceneId } from "@/harness/registry/load";
import { SCENE_LABELS } from "./constants";

export interface HandoffPrepareResult {
  target_conversation_id: string;
  created: boolean;
  target_scene: SceneId;
}

/** PRD §5.6.3 · resolve_handoff_target */
export async function resolveHandoffTarget(
  supabase: SupabaseClient,
  targetScene: SceneId,
): Promise<HandoffPrepareResult> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("conversation_type", targetScene)
    .eq("metadata->>type_locked", "true")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return {
      target_conversation_id: existing.id,
      created: false,
      target_scene: targetScene,
    };
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      title: `${SCENE_LABELS[targetScene]} · 新对话`,
      conversation_type: "chat",
      metadata: {
        type_locked: false,
        active_tab: targetScene,
        has_unconfirmed: false,
      },
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message ?? "无法创建目标对话。");
  }

  return {
    target_conversation_id: created.id,
    created: true,
    target_scene: targetScene,
  };
}
