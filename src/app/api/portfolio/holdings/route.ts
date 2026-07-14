import { NextResponse } from "next/server";
import { holdingsRead } from "@/lib/portfolio/read";
import { getSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabase();
  const holdings = await holdingsRead(supabase);
  return NextResponse.json(holdings);
}
