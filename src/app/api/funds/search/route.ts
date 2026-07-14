import { NextRequest, NextResponse } from "next/server";
import { searchFunds } from "@/lib/fund/watchlist";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchFunds(q);
  return NextResponse.json({ results });
}
