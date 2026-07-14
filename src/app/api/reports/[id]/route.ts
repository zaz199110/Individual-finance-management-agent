import { NextRequest, NextResponse } from "next/server";
import { getReportById } from "@/lib/reports/read";
import { getSupabase } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabase();
  const result = await getReportById(supabase, id);

  if (!result.ok || !result.report) {
    return NextResponse.json(
      {
        code: result.code ?? "ERR-RPT-NOT-FOUND",
        error: result.error ?? "报告不存在。",
      },
      { status: supabase ? 404 : 503 },
    );
  }

  const { markdown, valid_report_ids, file_exists, ...meta } = result.report;
  return NextResponse.json({
    ...meta,
    content: markdown,
    markdown,
    valid_report_ids,
    file_exists,
  });
}
