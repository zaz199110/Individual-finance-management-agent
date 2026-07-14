import { NextRequest, NextResponse } from "next/server";
import { openReportFile } from "@/lib/reports/desktop-actions";

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await openReportFile(id);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR-RPT-NOT-FOUND") {
      return errorResponse(code, 404);
    }
    if (code === "ERR-RPT-FILE-MISSING") {
      return errorResponse(code, 409);
    }
    if (code === "ERR-DESKTOP-UNAVAILABLE") {
      return errorResponse(code, 501);
    }
    if (code === "ERR-DESKTOP-OPEN-FAILED") {
      return errorResponse(code, 500, e instanceof Error ? e.message : undefined);
    }
    return errorResponse("ERR-DESKTOP-OPEN-FAILED", 500);
  }
}
