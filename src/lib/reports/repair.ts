import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import type { ReportTab } from "./types";

const VALID_TABS: ReportTab[] = ["profile", "plan", "portfolio", "fund"];

interface RepairResult {
  tab: ReportTab;
  added: number;
  updated: number;
  removed: number;
  local_files: number;
  supabase_records: number;
}

/**
 * 修复单个 Tab 的报告索引：扫描本地文件 → 补全/修正 Supabase report_index。
 *
 * - 文件在本地、记录不在 Supabase → 补入记录
 * - 记录在 Supabase、file_path 指向不存在的文件 → 修正路径（若本地有同 id 文件）
 * - 记录在 Supabase、本地无对应文件 → 删除记录
 */
async function repairTab(
  supabase: SupabaseClient,
  tab: ReportTab,
): Promise<RepairResult> {
  const publishedDir = path.join(getDataDir(), "reports", tab, "published");

  // 1. 扫描本地文件
  const localFiles = new Map<string, string>(); // id → absolute path
  if (fs.existsSync(publishedDir)) {
    for (const file of fs.readdirSync(publishedDir)) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.md$/, "");
      localFiles.set(id, path.join(publishedDir, file));
    }
  }

  // 2. 查询 Supabase
  const { data: rows, error } = await supabase
    .from("report_index")
    .select("id, file_path, report_name, generated_at")
    .eq("report_type", tab);

  if (error) {
    throw new Error(`Supabase query failed for ${tab}: ${error.message}`);
  }

  const supabaseRecords = new Map<string, { file_path: string }>();
  for (const row of rows ?? []) {
    supabaseRecords.set(row.id as string, {
      file_path: (row.file_path as string) ?? "",
    });
  }

  let added = 0;
  let updated = 0;
  let removed = 0;

  // 3. 补全：本地有、Supabase 无
  for (const [id, filePath] of localFiles) {
    if (!supabaseRecords.has(id)) {
      // 从文件名和内容提取元信息
      const content = fs.readFileSync(filePath, "utf8");
      const firstLine = content.split("\n")[0]?.trim();
      const reportName =
        firstLine && firstLine.startsWith("# ")
          ? firstLine.slice(2).trim()
          : id;
      const stat = fs.statSync(filePath);

      // 从文件名提取 fund_code（格式: {fundCode}-{timestamp}.md）
      const fundCodeMatch = id.match(/^(\d{6})-/);
      const fundCode = fundCodeMatch?.[1] ?? null;

      const { error: insertError } = await supabase.from("report_index").insert({
        report_type: tab,
        report_name: reportName,
        report_slug: id,
        file_path: filePath,
        fund_code: fundCode,
        generated_at: stat.mtime.toISOString(),
        metadata: {},
      });

      if (!insertError) added++;
    }
  }

  // 4. 修正 & 清理：Supabase 有、检查 file_path
  for (const [id, record] of supabaseRecords) {
    const localPath = localFiles.get(id);

    if (!localPath) {
      // 本地文件不存在 → 删除 Supabase 记录
      await supabase.from("report_index").delete().eq("id", id);
      removed++;
      continue;
    }

    // file_path 与实际不一致 → 修正
    if (record.file_path !== localPath) {
      await supabase
        .from("report_index")
        .update({ file_path: localPath })
        .eq("id", id);
      updated++;
    }
  }

  return {
    tab,
    added,
    updated,
    removed,
    local_files: localFiles.size,
    supabase_records: supabaseRecords.size,
  };
}

/**
 * 修复所有 Tab 的报告索引。
 */
export async function repairReportIndex(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; results: RepairResult[]; error?: string }> {
  try {
    const results: RepairResult[] = [];
    for (const tab of VALID_TABS) {
      const result = await repairTab(supabase, tab);
      results.push(result);
    }
    return { ok: true, results };
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
