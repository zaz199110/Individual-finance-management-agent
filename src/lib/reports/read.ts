import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDataDir } from "@/lib/paths";
import type { ReportDetail, ReportListItem, ReportTab } from "./types";

interface ReportRow {
  id: string;
  report_type: ReportTab;
  report_slug?: string | null;
  report_name: string;
  generated_at: string;
  file_path: string;
  goal_constraint_id: string | null;
  fund_code: string | null;
  profile_version_id: string | null;
  goal_constraint_revision_id: string | null;
  metadata?: Record<string, unknown> | null;
}

export function readTriggerSource(
  metadata?: Record<string, unknown> | null,
): "scheduled" | undefined {
  if (metadata?.trigger_source === "scheduled") return "scheduled";
  return undefined;
}

function listLocalReports(
  tab: ReportTab,
  options?: { q?: string },
): { ok: boolean; reports: ReportListItem[]; error?: string; code?: string } {
  const dir = path.join(getDataDir(), "reports", tab, "published");
  if (!fs.existsSync(dir)) {
    return { ok: true, reports: [] };
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const q = options?.q?.trim().toLowerCase();

  const reports: ReportListItem[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const id = file.replace(/\.md$/, "");

    let reportName: string;
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const firstLine = content.split("\n")[0]?.trim();
      if (firstLine && firstLine.startsWith("# ")) {
        reportName = firstLine.slice(2).trim();
      } else {
        reportName = id;
      }
    } catch {
      reportName = id;
    }

    if (q && !reportName.toLowerCase().includes(q)) continue;

    const stat = fs.statSync(filePath);

    reports.push({
      id,
      report_type: tab,
      report_name: reportName,
      generated_at: stat.mtime.toISOString(),
      file_path: filePath,
      goal_constraint_id: null,
      fund_code: null,
    });
  }

  reports.sort(
    (a, b) =>
      new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
  );

  return { ok: true, reports };
}

async function getCurrentProfileId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("profile_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function latestRevisionId(
  supabase: SupabaseClient,
  goalConstraintId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("goal_constraint_revisions")
    .select("id")
    .eq("goal_constraint_id", goalConstraintId)
    .order("revision_no", { ascending: false })
    .limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

async function markProfileCurrentFlags(
  supabase: SupabaseClient,
  rows: ReportRow[],
): Promise<Map<string, boolean>> {
  const flags = new Map<string, boolean>();
  const currentProfileId = await getCurrentProfileId(supabase);
  if (!currentProfileId) return flags;

  const byGoal = new Map<string, ReportRow[]>();
  for (const row of rows) {
    if (row.report_type !== "profile" || !row.goal_constraint_id) continue;
    const list = byGoal.get(row.goal_constraint_id) ?? [];
    list.push(row);
    byGoal.set(row.goal_constraint_id, list);
  }

  for (const [goalId, goalRows] of byGoal) {
    const latestRev = await latestRevisionId(supabase, goalId);
    if (!latestRev) continue;
    for (const row of goalRows) {
      const aligned =
        row.profile_version_id === currentProfileId &&
        row.goal_constraint_revision_id === latestRev;
      if (aligned) {
        flags.set(row.id, true);
        break;
      }
    }
  }

  return flags;
}

function toListItem(row: ReportRow, isCurrent?: boolean): ReportListItem {
  const triggerSource = readTriggerSource(row.metadata);
  return {
    id: row.report_slug ?? row.id,
    report_type: row.report_type,
    report_name: row.report_name,
    generated_at: row.generated_at,
    file_path: row.file_path,
    goal_constraint_id: row.goal_constraint_id,
    fund_code: row.fund_code,
    ...(isCurrent ? { is_current: true } : {}),
    ...(triggerSource ? { trigger_source: triggerSource } : {}),
  };
}

export async function listReports(
  supabase: SupabaseClient | null,
  tab: ReportTab,
  options?: { q?: string; debug?: boolean },
): Promise<{ ok: boolean; reports: ReportListItem[]; error?: string; code?: string; debugInfo?: Record<string, unknown> }> {
  const debugInfo: Record<string, unknown> = {};
  const isDebug = options?.debug === true;

  if (!supabase) {
    return listLocalReports(tab, options);
  }

  // ── LOCAL FILESYSTEM IS SOURCE OF TRUTH ──
  // 1. Scan local published directory for all .md files → authoritative list
  const localResult = listLocalReports(tab, options);
  if (!localResult.ok) {
    return localResult;
  }
  const localReports = localResult.reports;
  if (isDebug) debugInfo.localReports = localReports.map(r => ({ id: r.id, report_name: r.report_name, file_path: r.file_path }));

  // 2. Fetch all existing DB records for this tab
  const { data, error } = await supabase
    .from("report_index")
    .select(
      "id, report_type, report_slug, report_name, generated_at, file_path, goal_constraint_id, fund_code, profile_version_id, goal_constraint_revision_id, metadata",
    )
    .eq("report_type", tab);

  if (error) {
    if (isDebug) debugInfo.dbError = error.message;
    return { ok: false, reports: [], error: error.message, ...(isDebug ? { debugInfo } : {}) };
  }

  const dbRows = (data ?? []) as ReportRow[];
  if (isDebug) debugInfo.dbRows = dbRows.map(r => ({ id: r.id, report_slug: r.report_slug, report_name: r.report_name }));

  const dbBySlug = new Map<string, ReportRow>();
  for (const row of dbRows) {
    if (row.report_slug) {
      dbBySlug.set(row.report_slug, row);
    }
  }

  const localIds = new Set(localReports.map((r) => r.id));

  // 3. For each local file: sync with DB
  const mergedRows: ReportRow[] = [];
  for (const local of localReports) {
    const dbRow = dbBySlug.get(local.id);

    if (dbRow) {
      // DB record exists
      if (dbRow.file_path !== local.file_path) {
        // file_path is wrong → UPDATE it
        await supabase
          .from("report_index")
          .update({ file_path: local.file_path })
          .eq("id", dbRow.id);
        dbRow.file_path = local.file_path;
      }
      // Use DB metadata (report_name, generated_at, etc.) but ensure file_path is correct
      mergedRows.push(dbRow);
    } else {
      // No DB record → INSERT (let Supabase auto-generate UUID id)
      const insertRow = {
        report_slug: local.id,
        report_type: tab,
        report_name: local.report_name,
        file_path: local.file_path,
        generated_at: local.generated_at,
        goal_constraint_id: null,
        fund_code: null,
        metadata: {},
      };
      const { data: inserted, error: insertErr } = await supabase
        .from("report_index")
        .insert(insertRow)
        .select();
      if (!insertErr && inserted && inserted.length > 0) {
        mergedRows.push(inserted[0] as ReportRow);
      } else if (isDebug) {
        debugInfo.insertErrors = (debugInfo.insertErrors as string[]) ?? [];
        (debugInfo.insertErrors as string[]).push(`${local.id}: ${insertErr?.message ?? "unknown"}`);
      }
    }
  }

  // 4. For DB records where local file doesn't exist → DELETE the DB record
  //    Only do full cleanup when no search query (q) is active,
  //    otherwise the filtered localIds would incorrectly mark non-matching
  //    but still-existing files as "missing".
  if (!options?.q?.trim()) {
    const idsToDelete: string[] = [];
    for (const row of dbRows) {
      const slug = row.report_slug;
      if (slug && !localIds.has(slug)) {
        idsToDelete.push(row.id);
      }
    }
    if (idsToDelete.length > 0) {
      await supabase.from("report_index").delete().in("id", idsToDelete);
    }
  }

  // Sort by generated_at descending
  mergedRows.sort(
    (a, b) =>
      new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
  );

  const currentFlags =
    tab === "profile" ? await markProfileCurrentFlags(supabase, mergedRows) : new Map();

  return {
    ok: true,
    reports: mergedRows.map((row) => toListItem(row, currentFlags.get(row.id))),
    ...(isDebug ? { debugInfo } : {}),
  };
}

export async function getAllReportIds(
  supabase: SupabaseClient | null,
): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data } = await supabase.from("report_index").select("id");
  return new Set((data ?? []).map((r) => r.id as string));
}

export interface ReportDetailResult extends ReportDetail {
  file_exists: boolean;
}

export function findLocalReportFile(
  id: string,
): { filePath: string; tab: ReportTab } | null {
  const tabs: ReportTab[] = ["profile", "plan", "portfolio", "fund"];
  for (const tab of tabs) {
    const filePath = path.join(
      getDataDir(),
      "reports",
      tab,
      "published",
      `${id}.md`,
    );
    if (fs.existsSync(filePath)) return { filePath, tab };
  }
  return null;
}

export async function getReportById(
  supabase: SupabaseClient | null,
  id: string,
): Promise<{
  ok: boolean;
  report?: ReportDetailResult;
  error?: string;
  code?: string;
}> {
  // ── LOCAL FILESYSTEM IS SOURCE OF TRUTH ──
  // 1. First, try to find the file locally (primary path)
  const found = findLocalReportFile(id);

  if (found) {
    const content = fs.readFileSync(found.filePath, "utf8");
    const firstLine = content.split("\n")[0]?.trim();
    const reportName =
      firstLine && firstLine.startsWith("# ") ? firstLine.slice(2).trim() : id;
    const stat = fs.statSync(found.filePath);

    let report: ReportDetailResult = {
      id,
      report_type: found.tab,
      report_name: reportName,
      generated_at: stat.mtime.toISOString(),
      file_path: found.filePath,
      goal_constraint_id: null,
      fund_code: null,
      markdown: content,
      valid_report_ids: [],
      file_exists: true,
    };

    // If we have Supabase, enrich with DB metadata and valid_report_ids
    if (supabase) {
      const { data: dbRow } = await supabase
        .from("report_index")
        .select(
          "id, report_type, report_slug, report_name, generated_at, file_path, goal_constraint_id, fund_code, profile_version_id, goal_constraint_revision_id, metadata",
        )
        .eq("report_slug", id)
        .maybeSingle();

      if (dbRow) {
        const row = dbRow as ReportRow;
        // Ensure file_path in DB is correct
        if (row.file_path !== found.filePath) {
          await supabase
            .from("report_index")
            .update({ file_path: found.filePath })
            .eq("report_slug", id);
        }

        let isCurrent: boolean | undefined;
        if (row.report_type === "profile" && row.goal_constraint_id) {
          const flags = await markProfileCurrentFlags(supabase, [row]);
          isCurrent = flags.get(row.id);
        }

        const triggerSource = readTriggerSource(row.metadata);
        report = {
          ...report,
          report_name: row.report_name || reportName,
          generated_at: row.generated_at || report.generated_at,
          goal_constraint_id: row.goal_constraint_id,
          fund_code: row.fund_code,
          ...(isCurrent ? { is_current: true } : {}),
          ...(triggerSource ? { trigger_source: triggerSource } : {}),
        };
      }

      const validIds = await getAllReportIds(supabase);
      report.valid_report_ids = [...validIds];
    }

    return { ok: true, report };
  }

  // 2. File not found locally — try DB by UUID to recover file_path
  if (!supabase) {
    return { ok: false, error: "报告不存在。", code: "ERR-RPT-NOT-FOUND" };
  }

  // Check DB for metadata, but file doesn't exist on disk
  const { data, error } = await supabase
    .from("report_index")
    .select(
      "id, report_type, report_slug, report_name, generated_at, file_path, goal_constraint_id, fund_code, profile_version_id, goal_constraint_revision_id, metadata",
    )
    .eq("report_slug", id)
    .maybeSingle();

  // If slug lookup failed, try UUID lookup (some routes use UUID as id)
  let dbData = data;
  if (!dbData && !error) {
    const { data: uuidRow } = await supabase
      .from("report_index")
      .select(
        "id, report_type, report_slug, report_name, generated_at, file_path, goal_constraint_id, fund_code, profile_version_id, goal_constraint_revision_id, metadata",
      )
      .eq("id", id)
      .maybeSingle();
    dbData = uuidRow;
  }

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!dbData) {
    return { ok: false, error: "报告不存在。", code: "ERR-RPT-NOT-FOUND" };
  }

  // DB record exists — try to read the file from file_path stored in DB
  const row = dbData as ReportRow;
  let isCurrent: boolean | undefined;
  if (row.report_type === "profile" && row.goal_constraint_id) {
    const flags = await markProfileCurrentFlags(supabase, [row]);
    isCurrent = flags.get(row.id);
  }

  const validIds = await getAllReportIds(supabase);

  // Try reading the actual file from DB file_path
  if (row.file_path && fs.existsSync(row.file_path)) {
    const content = fs.readFileSync(row.file_path, "utf8");
    const firstLine = content.split("\n")[0]?.trim();
    const reportName =
      firstLine && firstLine.startsWith("# ") ? firstLine.slice(2).trim() : row.report_name || id;
    return {
      ok: true,
      report: {
        id,
        report_type: row.report_type,
        report_name: row.report_name || reportName,
        generated_at: row.generated_at,
        file_path: row.file_path,
        goal_constraint_id: row.goal_constraint_id,
        fund_code: row.fund_code,
        markdown: content,
        valid_report_ids: [...validIds],
        file_exists: true,
      },
    };
  }

  return {
    ok: true,
    report: {
      ...toListItem(row, isCurrent),
      markdown: "",
      valid_report_ids: [...validIds],
      file_exists: false,
    },
  };
}
