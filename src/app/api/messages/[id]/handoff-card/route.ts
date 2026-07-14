import { NextRequest, NextResponse } from "next/server";
import { updateHandoffCardStatus } from "@/lib/handoff/message-cards";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as {
    status?: "accepted" | "dismissed" | "stale";
  };

  if (!body.status || !["accepted", "dismissed", "stale"].includes(body.status)) {
    return NextResponse.json({ error: "无效 status" }, { status: 400 });
  }

  const ok = await updateHandoffCardStatus(id, body.status);
  if (!ok) {
    return NextResponse.json({ error: "消息不存在或无可更新卡片" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message_id: id, status: body.status });
}
