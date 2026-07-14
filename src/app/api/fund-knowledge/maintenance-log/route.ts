import { NextRequest, NextResponse } from "next/server";
import { listMaintenanceLog, trimMaintenanceLog } from "@/harness/infra/fund_knowledge/index-db";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function GET(req: NextRequest) {
  try {
    const ctx = getFundKnowledgeContext();
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
    const fundCode = req.nextUrl.searchParams.get("fund_code") ?? undefined;
    const logType = req.nextUrl.searchParams.get("type") ?? undefined;
    const result = listMaintenanceLog({
      vaultRoot: ctx.vaultRoot,
      limit,
      offset,
      fund_code: fundCode,
      type: logType,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: "ERR-FK-VAULT-READ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = getFundKnowledgeContext();
    const olderThanDays = Number(req.nextUrl.searchParams.get("older_than_days") ?? 90);
    const result = trimMaintenanceLog({
      vaultRoot: ctx.vaultRoot,
      olderThanDays,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: "ERR-FK-VAULT-READ" }, { status: 500 });
  }
}
