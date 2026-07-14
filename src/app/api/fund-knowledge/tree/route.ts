import { NextRequest, NextResponse } from "next/server";
import { buildVaultTree } from "@/harness/infra/fund_knowledge/vault-tree";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function GET(req: NextRequest) {
  try {
    const ctx = getFundKnowledgeContext();
    const includeEmpty =
      req.nextUrl.searchParams.get("include_empty_doc_types") !== "false";
    const tree = buildVaultTree(ctx.vaultRoot, includeEmpty);
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json({ code: "ERR-FK-VAULT-READ" }, { status: 500 });
  }
}
