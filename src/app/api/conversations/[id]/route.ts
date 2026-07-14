import { NextRequest, NextResponse } from "next/server";
import { buildPinMetadata } from "@/lib/chat/conversation-pin";
import { unpinOtherConversations } from "@/lib/chat/conversation-pin.server";
import {
  enrichApiMessagesWithWorkflowTasks,
  messagesNeedWorkflowTaskHydration,
} from "@/lib/chat/message-workflow";
import { getSupabase } from "@/lib/supabase/server";
import type { SceneId } from "@/harness/registry/load";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  const messagesLimit = Number(
    request.nextUrl.searchParams.get("messages_limit") ?? "50",
  );

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !conversation) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(messagesLimit);

  const rows = messages ?? [];
  let enrichedMessages = rows;

  if (messagesNeedWorkflowTaskHydration(rows)) {
    const { data: taskRows } = await supabase
      .from("workflow_tasks")
      .select(
        "run_id, task_key, label, status, parent_task_key, node_depth, sort_order",
      )
      .eq("conversation_id", id)
      .order("sort_order", { ascending: true });

    enrichedMessages = enrichApiMessagesWithWorkflowTasks(
      rows,
      (taskRows ?? []) as Array<Record<string, unknown>>,
    );
  }

  return NextResponse.json({ conversation, messages: enrichedMessages });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  const body = (await request.json()) as {
    title?: string;
    pinned?: boolean;
    metadata?: { active_tab?: SceneId };
  };

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  const metadata = existing.metadata as Record<string, unknown>;
  if (metadata.type_locked && body.metadata?.active_tab) {
    // CH-TYPE-01: locked conversations cannot change type via PATCH
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  let nextMetadata = { ...metadata };

  if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    if (trimmed) {
      patch.title = trimmed;
      nextMetadata = { ...nextMetadata, title_customized: true };
    }
  }

  if (typeof body.pinned === "boolean") {
    if (body.pinned) {
      await unpinOtherConversations(supabase, id);
    }
    nextMetadata = buildPinMetadata(nextMetadata, body.pinned);
  }

  if (body.metadata?.active_tab && !metadata.type_locked) {
    nextMetadata = {
      ...nextMetadata,
      active_tab: body.metadata.active_tab,
    };
  }

  if (
    typeof body.title === "string" ||
    typeof body.pinned === "boolean" ||
    (body.metadata?.active_tab && !metadata.type_locked)
  ) {
    patch.metadata = nextMetadata;
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
