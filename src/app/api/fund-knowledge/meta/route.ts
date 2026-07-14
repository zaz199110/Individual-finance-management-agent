import { NextResponse } from "next/server";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function GET() {
  try {
    const ctx = getFundKnowledgeContext();
    return NextResponse.json({
      vault_root: ctx.vaultRoot,
      index_db_path: ctx.indexDbPath,
      vault_root_exists: ctx.vaultRootExists,
      index_db_exists: ctx.indexDbExists,
    });
  } catch {
    return NextResponse.json({ code: "ERR-FK-VAULT-READ" }, { status: 500 });
  }
}
