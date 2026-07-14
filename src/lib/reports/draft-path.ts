import fs from "node:fs";
import path from "node:path";
import { ensureRunWorkspace } from "@/harness/runs/workspace";

export const DRAFT_REPORT_FILENAME = "draft-report.md";
export const DRAFT_META_FILENAME = "draft-meta.json";

export function getDraftReportPath(conversationId: string, runId: string): string {
  return path.join(ensureRunWorkspace(conversationId, runId), DRAFT_REPORT_FILENAME);
}

export function getDraftMetaPath(conversationId: string, runId: string): string {
  return path.join(ensureRunWorkspace(conversationId, runId), DRAFT_META_FILENAME);
}

export function getDraftMetaPathForReport(draftReportPath: string): string {
  return path.join(path.dirname(draftReportPath), DRAFT_META_FILENAME);
}

/** Prefer run workspace path; fall back to legacy metadata file_path. */
export function resolveDraftReportPath(input: {
  conversationId: string;
  runId: string;
  filePath?: string;
}): string {
  const runPath = getDraftReportPath(input.conversationId, input.runId);
  if (fs.existsSync(runPath)) return runPath;
  if (input.filePath && fs.existsSync(input.filePath)) return input.filePath;
  return runPath;
}
