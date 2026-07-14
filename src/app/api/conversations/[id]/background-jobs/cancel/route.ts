import { NextRequest, NextResponse } from "next/server";
import { cancelRunningJobsForConversation } from "@/harness/background";

/** CH-16 · 停止生成时取消进行中的后台 job */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cancelled = await cancelRunningJobsForConversation(id);
  return NextResponse.json({ cancelled });
}
