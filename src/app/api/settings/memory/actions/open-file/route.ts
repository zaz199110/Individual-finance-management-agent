import { NextResponse } from "next/server";
import { openUserMemoryFile } from "@/lib/settings/user-memory";

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST() {
  try {
    const result = await openUserMemoryFile();
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR-DESKTOP-UNAVAILABLE") {
      return errorResponse(code, 501);
    }
    if (code === "ERR-DESKTOP-OPEN-FAILED") {
      return errorResponse(code, 500, e instanceof Error ? e.message : undefined);
    }
    return errorResponse("ERR-DESKTOP-OPEN-FAILED", 500);
  }
}
