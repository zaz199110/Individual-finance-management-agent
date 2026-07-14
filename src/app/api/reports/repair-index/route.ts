import { NextResponse } from "next/server";
import { repairReportIndex } from "@/lib/reports/repair";
import { getSupabase } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const result = await repairReportIndex(supabase);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const summary = result.results.reduce(
    (acc, r) => ({
      added: acc.added + r.added,
      updated: acc.updated + r.updated,
      removed: acc.removed + r.removed,
    }),
    { added: 0, updated: 0, removed: 0 },
  );

  return NextResponse.json({
    ok: true,
    ...summary,
    details: result.results,
  });
}
