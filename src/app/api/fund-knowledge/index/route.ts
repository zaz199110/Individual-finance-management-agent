import { NextRequest, NextResponse } from "next/server";
import { rebuildIndex } from "@/harness/infra/fund_knowledge/index-db";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { scope?: string; fund_code?: string };
    const ctx = getFundKnowledgeContext();

    if (body.scope === "fund") {
      const result = rebuildIndex({
        vaultRoot: ctx.vaultRoot,
        scope: "fund",
        fund_code: body.fund_code,
      });
      return NextResponse.json(result);
    }

    if (body.scope === "all" || !body.scope) {
      const result = rebuildIndex({ vaultRoot: ctx.vaultRoot, scope: "all" });
      return NextResponse.json(result);
    }

    return NextResponse.json({ code: "ERR-FK-UPLOAD-INVALID" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ERR-FK-INDEX-BUSY") {
      return NextResponse.json({ code: msg }, { status: 409 });
    }
    return NextResponse.json({ code: msg }, { status: 500 });
  }
}
