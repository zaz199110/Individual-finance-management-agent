import fs from "node:fs";
import { getDraftMetaPathForReport } from "./draft-path";

export function writeDraftMeta(
  draftReportPath: string,
  meta: Record<string, unknown>,
): void {
  const metaPath = getDraftMetaPathForReport(draftReportPath);
  const now = new Date().toISOString();
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(metaPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      existing = {};
    }
  }
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...existing,
        ...meta,
        draft_created_at: existing.draft_created_at ?? now,
        draft_updated_at: now,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function readDraftMeta(
  draftReportPath: string,
): Record<string, unknown> | null {
  const metaPath = getDraftMetaPathForReport(draftReportPath);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function extractValidReportIds(
  meta: Record<string, unknown> | null,
): string[] {
  if (!meta) return [];
  const ids: string[] = [];
  for (const key of ["profile_report_id", "plan_report_id"]) {
    const v = meta[key];
    if (typeof v === "string") ids.push(v.toLowerCase());
  }
  return ids;
}

export function writeFundDraftMeta(input: {
  draftPath: string;
  fundCode: string;
  fundName: string;
  archetype: string;
  asOfTradeDate?: string;
  knowledgeCitationCount?: number;
}): void {
  writeDraftMeta(input.draftPath, {
    report_type: "fund",
    fund_code: input.fundCode,
    report_archetype: input.archetype,
    as_of_trade_date: input.asOfTradeDate ?? null,
    knowledge_citation_count: input.knowledgeCitationCount ?? 0,
  });
}

export function removeDraftMetaIfExists(draftPath: string): void {
  const metaPath = getDraftMetaPathForReport(draftPath);
  const legacy = draftPath.replace(/\.md$/i, ".meta.json");
  for (const p of [metaPath, legacy]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
