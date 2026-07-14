import { NextRequest, NextResponse } from "next/server";
import { removeFromWatchlist } from "@/lib/fund/watchlist";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ fund_code: string }> },
) {
  const { fund_code } = await ctx.params;
  const result = await removeFromWatchlist(fund_code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
