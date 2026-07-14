import { NextRequest, NextResponse } from "next/server";
import { addToWatchlist, listWatchlist } from "@/lib/fund/watchlist";

export async function GET() {
  const items = await listWatchlist();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { fund_code?: string };
    const result = await addToWatchlist(String(body.fund_code ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ item: result.item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "添加失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
