import { NextRequest } from "next/server";
import { runHarnessLoop } from "@/harness/loop";
import { createSseStream, sseResponse } from "@/lib/sse";
import type { ChatStreamRequest } from "@/harness/types";
import type { SceneId } from "@/harness/registry/load";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ChatStreamRequest;

  if (!body.conversation_id || !body.scene) {
    return new Response(
      JSON.stringify({ error: "缺少 conversation_id 或 scene" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { stream, writer } = createSseStream();

  void runHarnessLoop(
    {
      conversation_id: body.conversation_id,
      content: body.content,
      attachments: body.attachments,
      scene: body.scene as SceneId,
      trigger: body.trigger,
      target_scene: body.target_scene,
      handoff_summary: body.handoff_summary,
      source_conversation_id: body.source_conversation_id,
      handoff_card_message_id: body.handoff_card_message_id,
      edit_resend_message_id: body.edit_resend_message_id,
    },
    writer,
    { abortSignal: request.signal },
  );

  return sseResponse(stream);
}
