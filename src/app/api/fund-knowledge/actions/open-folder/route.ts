import { NextRequest, NextResponse } from "next/server";
import { openFundKnowledgeFolder } from "@/lib/fund-knowledge/desktop-actions";

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ code, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { target?: string; fund_code?: string };
    const target = body.target === "fund" ? "fund" : "vault_root";
    const result = await openFundKnowledgeFolder({
      target,
      fund_code: body.fund_code,
    });
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR-DESKTOP-UNAVAILABLE") {
      return errorResponse(code, 501);
    }
    if (code === "ERR-FK-PATH-INVALID") {
      return errorResponse(code, 400);
    }
    if (code === "ERR-FK-FILE-NOT-FOUND") {
      return errorResponse(code, 404);
    }
    if (code === "ERR-DESKTOP-OPEN-FAILED") {
      return errorResponse(code, 500, e instanceof Error ? e.message : undefined);
    }
    return errorResponse("ERR-DESKTOP-OPEN-FAILED", 500);
  }
}
