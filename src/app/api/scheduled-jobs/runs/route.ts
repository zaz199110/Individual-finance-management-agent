import { NextRequest, NextResponse } from "next/server";
import { listScheduledJobRuns } from "@/lib/scheduled/jobs";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") ?? 0), 0);
  const runs = await listScheduledJobRuns(limit, offset);
  return NextResponse.json({ runs });
}
