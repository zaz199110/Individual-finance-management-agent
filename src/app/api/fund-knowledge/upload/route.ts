import { NextRequest, NextResponse } from "next/server";
import { uploadFundKnowledgeFiles } from "@/harness/infra/fund_knowledge/upload";
import { getFundKnowledgeContext } from "@/lib/fund-knowledge/context";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const fundCode = String(form.get("fund_code") ?? "").trim();
    const docType = String(form.get("doc_type") ?? "").trim();
    const fundNameOverride = String(form.get("fund_name_override") ?? "").trim() || undefined;

    const files: Array<{ filename: string; buffer: Buffer }> = [];
    for (const entry of form.entries()) {
      if (entry[0] === "files[]" || entry[0] === "files") {
        const value = entry[1];
        if (value instanceof File) {
          const buffer = Buffer.from(await value.arrayBuffer());
          files.push({ filename: value.name, buffer });
        }
      }
    }

    const ctx = getFundKnowledgeContext();
    const result = await uploadFundKnowledgeFiles({
      vaultRoot: ctx.vaultRoot,
      fund_code: fundCode,
      doc_type: docType,
      files,
      fund_name_override: fundNameOverride,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ERR-FK-INDEX-BUSY") {
      return NextResponse.json({ code: msg }, { status: 409 });
    }
    if (msg === "ERR-FK-UPLOAD-INVALID") {
      return NextResponse.json({ code: msg }, { status: 400 });
    }
    return NextResponse.json({ code: msg }, { status: 422 });
  }
}
