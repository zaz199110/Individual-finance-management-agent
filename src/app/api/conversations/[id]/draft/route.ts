import fs from "node:fs";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import {
  extractValidReportIds,
  readDraftMeta,
} from "@/lib/reports/draft-meta";
import { resolveDraftReportPath } from "@/lib/reports/draft-path";
import { isDraftPathInConversation } from "@/lib/reports/draft-path-guard";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await ctx.params;
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const url = new URL(req.url);
  const queryRunId = url.searchParams.get("run_id") ?? undefined;
  const queryFilePath = url.searchParams.get("file_path") ?? undefined;
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const pending = (conv?.metadata as Record<string, unknown> | null)
    ?.pending_report_draft as
    | {
        report_type?: string;
        report_name?: string;
        file_path?: string;
        run_id?: string;
      }
    | undefined;

  let runId = queryRunId ?? pending?.run_id;
  let filePath = queryFilePath ?? pending?.file_path;

  if (queryFilePath && !isDraftPathInConversation(conversationId, queryFilePath)) {
    return NextResponse.json({ error: "草稿路径无效。" }, { status: 400 });
  }

  if (!runId && filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const match = normalized.match(/\/runs\/[^/]+\/([^/]+)\/draft-report\.md$/);
    runId = match?.[1];
  }
  if (!runId) {
    return NextResponse.json({ error: "当前对话无待确认报告草稿。" }, { status: 404 });
  }

  const draftPath = resolveDraftReportPath({
    conversationId,
    runId,
    filePath,
  });
  if (!fs.existsSync(draftPath)) {
    return NextResponse.json({ error: "草稿文件不存在。" }, { status: 404 });
  }
  const markdown = fs.readFileSync(draftPath, "utf8");
  const meta = readDraftMeta(draftPath);

  return NextResponse.json({
    markdown,
    report_name: meta?.report_name ?? pending?.report_name ?? "报告草稿",
    report_type: meta?.report_type ?? pending?.report_type,
    draft_path: draftPath,
    run_id: runId,
    valid_report_ids: extractValidReportIds(meta),
  });
}
