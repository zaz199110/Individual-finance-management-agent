import { NextRequest, NextResponse } from "next/server";
import { listReports } from "@/lib/reports/read";
import type { ReportTab } from "@/lib/reports/types";
import { getSupabase } from "@/lib/supabase/server";

const VALID_TABS = new Set(["profile", "plan", "portfolio", "fund"]);

export async function GET(req: NextRequest) {
  const tab = (req.nextUrl.searchParams.get("tab") ??
    req.nextUrl.searchParams.get("type") ??
    "profile") as ReportTab;
  if (!VALID_TABS.has(tab)) {
    return NextResponse.json(
      { code: "ERR-RPT-TYPE", error: "无效的 tab 参数。" },
      { status: 400 },
    );
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const supabase = await getSupabase();
  const result = await listReports(supabase, tab, { q, debug });

  if (!result.ok) {
    const status =
      result.code === "ERR-RPT-SEARCH"
        ? 400
        : supabase
          ? 500
          : 503;
    return NextResponse.json(
      { code: result.code, error: result.error, reports: [], items: [] },
      { status },
    );
  }

  return NextResponse.json({
    reports: result.reports,
    items: result.reports,
    total: result.reports.length,
    ...("debugInfo" in result ? { debugInfo: (result as any).debugInfo } : {}),
  });
}
