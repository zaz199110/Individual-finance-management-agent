import { NextRequest, NextResponse } from "next/server";
import { holdingsRead } from "@/lib/portfolio/read";
import { ensureTradingCalendarYears } from "@/lib/scheduled/calendar";
import {
  formatScheduleLabel,
  getPortfolioScheduledJob,
  listScheduledJobRuns,
  patchPortfolioScheduledJob,
  type ScheduleKind,
} from "@/lib/scheduled/jobs";
import { getSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabase();
  const year = new Date().getFullYear();
  void ensureTradingCalendarYears([year, year + 1]).catch(() => {});

  const [job, runs, holdings] = await Promise.all([
    getPortfolioScheduledJob(),
    listScheduledJobRuns(50, 0),
    holdingsRead(supabase),
  ]);

  return NextResponse.json({
    job,
    schedule_label: formatScheduleLabel(job),
    runs,
    has_holdings: holdings.has_current,
    position_count: holdings.position_count,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      enabled?: boolean;
      schedule_kind?: ScheduleKind | null;
      schedule_days?: number[] | null;
      run_at_time?: string;
    };
    const result = await patchPortfolioScheduledJob(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      job: result.job,
      schedule_label: formatScheduleLabel(result.job!),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
