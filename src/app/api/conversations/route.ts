import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import type { SceneId } from "@/harness/registry/load";

const MAX_CONVERSATIONS = 300;

const DEFAULT_METADATA = {
  type_locked: false,
  active_tab: "chat" as SceneId,
  has_unconfirmed: false,
};

export async function GET(request: NextRequest) {
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ conversations: [] });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const conversationType = request.nextUrl.searchParams.get("conversation_type");
  const typeLocked = request.nextUrl.searchParams.get("type_locked");
  const pinnedOnly = request.nextUrl.searchParams.get("pinned");

  let query = supabase
    .from("conversations")
    .select("id, title, conversation_type, metadata, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (conversationType) {
    query = query.eq("conversation_type", conversationType);
  }
  if (typeLocked === "true") {
    query = query.eq("metadata->>type_locked", "true");
  }
  if (pinnedOnly === "true") {
    query = query.eq("metadata->>pinned", "true");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "数据库未配置，请先完成设置。" },
      { status: 503 },
    );
  }

  let body: { conversation_type?: SceneId; active_tab?: SceneId } = {};
  try {
    body = (await request.json()) as {
      conversation_type?: SceneId;
      active_tab?: SceneId;
    };
  } catch {
    /* empty body ok */
  }

  // CH-NEW-01 / CH-TAB-01：POST 始终占位 chat + 未锁定；active_tab 仅预览场景空态
  const activeTab: SceneId =
    body.active_tab ?? body.conversation_type ?? "chat";
  const metadata = {
    ...DEFAULT_METADATA,
    type_locked: false,
    active_tab: activeTab,
  };

  let evictedOldest = false;

  const { count } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) >= MAX_CONVERSATIONS) {
    const { data: oldest } = await supabase
      .from("conversations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldest?.id) {
      await supabase.from("conversations").delete().eq("id", oldest.id);
      evictedOldest = true;
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: "新对话",
      conversation_type: "chat",
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    evicted_oldest: evictedOldest,
  });
}
