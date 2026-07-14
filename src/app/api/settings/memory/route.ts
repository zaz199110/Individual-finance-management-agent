import { NextRequest, NextResponse } from "next/server";
import { getUserMemory, patchUserMemory } from "@/lib/settings/user-memory";

export async function GET() {
  const memory = await getUserMemory();
  return NextResponse.json(memory);
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as { content_md?: string };
  if (body.content_md === undefined) {
    return NextResponse.json({ error: "缺少 content_md" }, { status: 400 });
  }
  const result = await patchUserMemory(body.content_md);
  return NextResponse.json(result);
}
