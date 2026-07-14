import { NextRequest, NextResponse } from "next/server";
import { listBackgroundJobs } from "@/harness/background";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const statusParam = _req.nextUrl.searchParams.get("status");

  let status: "running" | "done" | "failed" | "cancelled" | undefined;
  if (
    statusParam === "running" ||
    statusParam === "done" ||
    statusParam === "failed" ||
    statusParam === "cancelled"
  ) {
    status = statusParam;
  }

  const jobs = await listBackgroundJobs(id, status ? { status } : undefined);
  return NextResponse.json({ jobs });
}
