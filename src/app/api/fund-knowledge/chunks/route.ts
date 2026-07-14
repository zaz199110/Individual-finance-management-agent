import { NextRequest, NextResponse } from "next/server";
import { deleteChunksFromFile } from "@/harness/infra/fund_knowledge/chunk-delete";
import { getChunksForFile, isIndexBusy } from "@/harness/infra/fund_knowledge/index-db";
import { assertSafeVaultMdPath } from "@/harness/infra/fund_knowledge/path-security";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";
import { parseFundCodeFromVaultRelPath } from "@/lib/fund-knowledge/vault-dir";

export async function GET(req: NextRequest) {
  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ code: "ERR-FK-PATH-INVALID" }, { status: 400 });
  }

  try {
    const safe = assertSafeVaultMdPath(relPath);
    const ctx = getFundKnowledgeContext();
    const chunks = getChunksForFile(ctx.vaultRoot, safe);
    return NextResponse.json({ path: safe, chunks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ERR-FK-PATH-INVALID") {
      return NextResponse.json({ code: msg }, { status: 400 });
    }
    return NextResponse.json({ code: "ERR-FK-FILE-NOT-FOUND" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: string; chunk_ids?: string[] };
    if (!body.path || !Array.isArray(body.chunk_ids) || !body.chunk_ids.length) {
      return NextResponse.json({ code: "ERR-FK-PATH-INVALID" }, { status: 400 });
    }

    const safe = assertSafeVaultMdPath(body.path);
    const ctx = getFundKnowledgeContext();
    if (isIndexBusy(parseFundCodeFromVaultRelPath(safe))) {
      return NextResponse.json({ code: "ERR-FK-INDEX-BUSY" }, { status: 409 });
    }

    const result = deleteChunksFromFile({
      vaultRoot: ctx.vaultRoot,
      relativePath: safe,
      chunk_ids: body.chunk_ids,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ERR-FK-CHUNK-NOT-FOUND") {
      return NextResponse.json({ code: msg }, { status: 400 });
    }
    if (msg === "ERR-FK-INDEX-BUSY") {
      return NextResponse.json({ code: msg }, { status: 409 });
    }
    if (msg === "ERR-FK-PATH-INVALID") {
      return NextResponse.json({ code: msg }, { status: 400 });
    }
    return NextResponse.json({ code: "ERR-FK-FILE-NOT-FOUND" }, { status: 404 });
  }
}
