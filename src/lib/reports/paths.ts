import path from "node:path";
import { getDataDir, getProjectRoot } from "@/lib/paths";
import type { ReportTab } from "./types";

export function getReportTypeDir(reportType: ReportTab): string {
  return path.join(getDataDir(), "reports", reportType);
}

/** Resolve DB file_path (absolute or relative to project root) to absolute path. */
export function resolveReportFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(getProjectRoot(), filePath.replace(/^[/\\]+/, ""));
}

export function formatReportFilePathDisplay(filePath: string): string {
  const root = getProjectRoot();
  const abs = resolveReportFilePath(filePath);
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^[/\\]/, "");
  }
  return filePath;
}
