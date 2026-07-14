import { NextRequest, NextResponse } from "next/server";
import { isDesktopShellAvailable } from "@/lib/desktop/open-local-path";
import { isExternalHttpUrl, openExternalUrl } from "@/lib/desktop/open-external-url";

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url || !isExternalHttpUrl(url)) {
      return errorResponse("ERR-URL-INVALID", 400);
    }
    if (!isDesktopShellAvailable()) {
      return errorResponse("ERR-DESKTOP-UNAVAILABLE", 501);
    }
    await openExternalUrl(url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "ERR-URL-INVALID") {
      return errorResponse("ERR-URL-INVALID", 400);
    }
    return errorResponse(
      "ERR-DESKTOP-OPEN-FAILED",
      500,
      e instanceof Error ? e.message : undefined,
    );
  }
}
