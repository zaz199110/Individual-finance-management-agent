import { NextRequest, NextResponse } from "next/server";
import { editResendUserMessage } from "@/lib/chat/edit-resend";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const body = (await request.json()) as {
    message_id?: string;
    content?: string;
  };

  if (!body.message_id || typeof body.content !== "string") {
    return NextResponse.json({ error: "缺少 message_id 或 content" }, { status: 400 });
  }

  const result = await editResendUserMessage(
    conversationId,
    body.message_id,
    body.content,
  );

  if (!("ok" in result)) {
    const status =
      result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result);
}
