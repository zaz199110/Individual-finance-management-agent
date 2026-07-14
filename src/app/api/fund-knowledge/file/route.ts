import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteVaultMdFiles,
  getFileIndexStatus,
  hashFile,
  indexSingleFile,
  isIndexBusy,
} from "@/harness/infra/fund_knowledge/index-db";
import {
  assertSafeVaultMdPath,
  resolveVaultFilePath,
} from "@/harness/infra/fund_knowledge/path-security";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";
import { parseFundCodeFromVaultRelPath } from "@/lib/fund-knowledge/vault-dir";

export async function GET(req: NextRequest) {
  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ code: "ERR-FK-PATH-INVALID" }, { status: 400 });
  }

  try {
    const ctx = getFundKnowledgeContext();
    const safe = resolveVaultFilePath(ctx.vaultRoot, relPath);
    const exists = fs.existsSync(safe);

    if (!exists) {
      return NextResponse.json({
        path: relPath.replace(/\\/g, "/"),
        fund_code: parseFundCodeFromVaultRelPath(relPath),
        doc_type: relPath.split("/")[1] ?? "other",
        file_exists: false,
        index_status: "pending_refresh",
      });
    }

    const markdown = fs.readFileSync(safe, "utf8");
    const contentHash = hashFile(safe);
    const refresh = req.nextUrl.searchParams.get("refresh") === "1";

    let refreshError: string | null = null;
    if (refresh) {
      try {
        indexSingleFile({
          vaultRoot: ctx.vaultRoot,
          relativePath: relPath.replace(/\\/g, "/"),
          logType: "refresh_reindex",
        });
      } catch (e) {
        refreshError = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      path: relPath.replace(/\\/g, "/"),
      fund_code: parseFundCodeFromVaultRelPath(relPath),
      doc_type: relPath.split("/")[1] ?? "other",
      markdown,
      content_hash: contentHash,
      file_exists: true,
      index_status: getFileIndexStatus(ctx.vaultRoot, relPath.replace(/\\/g, "/")),
      refresh_error: refreshError ?? null,
    });
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
    const body = (await req.json()) as { paths?: string[] };
    if (!Array.isArray(body.paths) || !body.paths.length) {
      return NextResponse.json({ code: "ERR-FK-PATH-INVALID" }, { status: 400 });
    }

    const safePaths = body.paths.map((p) => assertSafeVaultMdPath(p));
    const ctx = getFundKnowledgeContext();

    for (const p of safePaths) {
      const fundCode = parseFundCodeFromVaultRelPath(p);
      if (isIndexBusy(fundCode)) {
        return NextResponse.json({ code: "ERR-FK-INDEX-BUSY" }, { status: 409 });
      }
    }

    const result = deleteVaultMdFiles({
      vaultRoot: ctx.vaultRoot,
      relativePaths: safePaths,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ERR-FK-PATH-INVALID") {
      return NextResponse.json({ code: msg }, { status: 400 });
    }
    return NextResponse.json({ code: "ERR-FK-FILE-NOT-FOUND" }, { status: 404 });
  }
}
