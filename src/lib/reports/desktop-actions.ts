import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDesktopShellAvailable,
  openLocalPath,
  openLocalTextFile,
} from "@/lib/desktop/open-local-path";
import { getSupabase } from "@/lib/supabase/server";
import { getReportTypeDir, resolveReportFilePath } from "./paths";
import { findLocalReportFile } from "./read";
import type { ReportTab } from "./types";

const VALID_TYPES = new Set<string>(["profile", "plan", "portfolio", "fund"]);

function desktopUnavailable(): never {
  const err = new Error("ERR-DESKTOP-UNAVAILABLE") as Error & { code: string };
  err.code = "ERR-DESKTOP-UNAVAILABLE";
  throw err;
}

function openFailed(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = "ERR-DESKTOP-OPEN-FAILED";
  throw err;
}

export async function openReportsFolder(reportType: ReportTab): Promise<{ opened_path: string }> {
  if (!isDesktopShellAvailable()) desktopUnavailable();
  if (!VALID_TYPES.has(reportType)) {
    const err = new Error("ERR-RPT-TYPE") as Error & { code: string };
    err.code = "ERR-RPT-TYPE";
    throw err;
  }

  const dir = getReportTypeDir(reportType);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await openLocalPath(dir);
  } catch (e) {
    openFailed(e instanceof Error ? e.message : "open failed");
  }
  return { opened_path: dir };
}

async function loadReportRow(
  supabase: SupabaseClient | null,
  reportId: string,
): Promise<{ file_path: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("report_index")
    .select("file_path")
    .eq("id", reportId)
    .maybeSingle();
  if (!data?.file_path) return null;
  return { file_path: data.file_path as string };
}

export async function openReportFile(reportId: string): Promise<{ opened_path: string }> {
  if (!isDesktopShellAvailable()) desktopUnavailable();

  const supabase = await getSupabase();
  const row = await loadReportRow(supabase, reportId);

  // 尝试 Supabase 记录的路径
  let abs: string | null = null;
  if (row?.file_path) {
    const resolved = resolveReportFilePath(row.file_path);
    if (fs.existsSync(resolved)) abs = resolved;
  }

  // 自愈：Supabase 路径失效，从本地文件系统查找
  if (!abs) {
    const local = findLocalReportFile(reportId);
    if (local) {
      const resolved = resolveReportFilePath(local.filePath);
      if (fs.existsSync(resolved)) abs = resolved;
    }
  }

  if (!abs) {
    const err = new Error("ERR-RPT-FILE-MISSING") as Error & { code: string };
    err.code = "ERR-RPT-FILE-MISSING";
    throw err;
  }

  try {
    await openLocalTextFile(abs);
  } catch (e) {
    openFailed(e instanceof Error ? e.message : "open failed");
  }
  return { opened_path: abs };
}
