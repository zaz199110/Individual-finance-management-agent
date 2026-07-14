import { NextRequest, NextResponse } from "next/server";
import { openReportsFolder } from "@/lib/reports/desktop-actions";
import type { ReportTab } from "@/lib/reports/types";

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { report_type?: string };
    const reportType = body.report_type as ReportTab | undefined;
    if (!reportType || !["profile", "plan", "portfolio", "fund"].includes(reportType)) {
      return errorResponse("ERR-RPT-TYPE", 400);
    }
    const result = await openReportsFolder(reportType);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR-DESKTOP-UNAVAILABLE") {
      return errorResponse(code, 501);
    }
    if (code === "ERR-RPT-TYPE") {
      return errorResponse(code, 400);
    }
    if (code === "ERR-DESKTOP-OPEN-FAILED") {
      return errorResponse(code, 500, e instanceof Error ? e.message : undefined);
    }
    return errorResponse("ERR-DESKTOP-OPEN-FAILED", 500);
  }
}
