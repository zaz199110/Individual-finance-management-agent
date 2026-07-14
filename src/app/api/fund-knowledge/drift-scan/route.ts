import { NextResponse } from "next/server";
import { driftScan } from "@/harness/infra/fund_knowledge/vault-tree";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function GET() {
  try {
    const ctx = getFundKnowledgeContext();
    const result = driftScan(ctx.vaultRoot);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: "ERR-FK-VAULT-READ" }, { status: 500 });
  }
}
