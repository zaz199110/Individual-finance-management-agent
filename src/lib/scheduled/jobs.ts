import { holdingsRead } from "@/lib/portfolio/read";
import { getSupabase } from "@/lib/supabase/server";

export type ScheduleKind = "weekly" | "monthly";

export interface ScheduledJob {
  id: string;
  job_type: string;
  enabled: boolean;
  schedule_kind: ScheduleKind | null;
  schedule_days: number[] | null;
  run_at_time: string;
  consecutive_failures: number;
  updated_at: string;
  last_run_at: string | null;
}

export interface ScheduledJobRun {
  id: string;
  job_id: string;
  triggered_at: string;
  status: "success" | "failed" | "skipped";
  report_index_id: string | null;
  conversation_id: string | null;
  failure_reason: string | null;
  skip_reason: string | null;
  as_of_trade_date: string | null;
  report_name?: string | null;
}

const PORTFOLIO_JOB_TYPE = "portfolio";

function defaultJob(): ScheduledJob {
  return {
    id: "local-portfolio-job",
    job_type: PORTFOLIO_JOB_TYPE,
    enabled: false,
    schedule_kind: null,
    schedule_days: null,
    run_at_time: "09:00",
    consecutive_failures: 0,
    updated_at: new Date().toISOString(),
    last_run_at: null,
  };
}

function mapJob(row: Record<string, unknown>): ScheduledJob {
  return {
    id: String(row.id),
    job_type: String(row.job_type),
    enabled: Boolean(row.enabled),
    schedule_kind: (row.schedule_kind as ScheduleKind | null) ?? null,
    schedule_days: Array.isArray(row.schedule_days)
      ? (row.schedule_days as number[])
      : null,
    run_at_time: String(row.run_at_time ?? "09:00"),
    consecutive_failures: Number(row.consecutive_failures ?? 0),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    last_run_at: row.last_run_at ? String(row.last_run_at) : null,
  };
}

function mapRun(row: Record<string, unknown>): ScheduledJobRun {
  return {
    id: String(row.id),
    job_id: String(row.job_id),
    triggered_at: String(row.triggered_at),
    status: row.status as ScheduledJobRun["status"],
    report_index_id: row.report_index_id ? String(row.report_index_id) : null,
    conversation_id: row.conversation_id ? String(row.conversation_id) : null,
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    skip_reason: row.skip_reason ? String(row.skip_reason) : null,
    as_of_trade_date: row.as_of_trade_date ? String(row.as_of_trade_date) : null,
    report_name: row.report_name ? String(row.report_name) : null,
  };
}

export function formatScheduleLabel(job: ScheduledJob): string {
  if (!job.schedule_kind || !job.schedule_days?.length) return "未设置";
  const time = job.run_at_time || "09:00";
  if (job.schedule_kind === "weekly") {
    const labels = ["日", "一", "二", "三", "四", "五", "六"];
    const days = job.schedule_days
      .sort((a, b) => a - b)
      .map((d) => `周${labels[d] ?? d}`)
      .join("、");
    return `每周 · ${days} · ${time}`;
  }
  const days = job.schedule_days.sort((a, b) => a - b).join(" 日、") + " 日";
  return `每月 · ${days} · ${time}`;
}

export function validateSchedulePatch(input: {
  enabled?: boolean;
  schedule_kind?: ScheduleKind | null;
  schedule_days?: number[] | null;
  run_at_time?: string;
}): string | null {
  if (input.run_at_time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.run_at_time)) {
    return "执行时间格式须为 HH:mm（00:00–23:59）。";
  }
  if (input.schedule_kind === "weekly" && input.schedule_days?.length) {
    if (input.schedule_days.some((d) => d < 0 || d > 6)) {
      return "每周须选择 0–6 之间的星期。";
    }
  }
  if (input.schedule_kind === "monthly" && input.schedule_days?.length) {
    if (input.schedule_days.some((d) => d < 1 || d > 31)) {
      return "每月须选择 1–31 之间的日期。";
    }
  }
  if (input.enabled && input.schedule_kind && !input.schedule_days?.length) {
    return "请至少选择一个触发日。";
  }
  return null;
}

export async function getPortfolioScheduledJob(): Promise<ScheduledJob> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("job_type", PORTFOLIO_JOB_TYPE)
      .maybeSingle();
    if (data) return mapJob(data as Record<string, unknown>);
  }
  return defaultJob();
}

export async function patchPortfolioScheduledJob(input: {
  enabled?: boolean;
  schedule_kind?: ScheduleKind | null;
  schedule_days?: number[] | null;
  run_at_time?: string;
}): Promise<{ ok: boolean; job?: ScheduledJob; error?: string }> {
  const validationError = validateSchedulePatch(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await getSupabase();
  const holdings = await holdingsRead(supabase);

  if (input.enabled === true && !holdings.has_current) {
    return { ok: false, error: "须先录入当前持仓才能开启定时任务。" };
  }

  const current = await getPortfolioScheduledJob();
  const next: ScheduledJob = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    schedule_kind:
      input.schedule_kind !== undefined ? input.schedule_kind : current.schedule_kind,
    schedule_days:
      input.schedule_days !== undefined ? input.schedule_days : current.schedule_days,
    run_at_time: input.run_at_time ?? current.run_at_time,
    updated_at: new Date().toISOString(),
  };

  if (next.enabled && (!next.schedule_kind || !next.schedule_days?.length)) {
    return { ok: false, error: "请设置触发频率后再开启。" };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from("scheduled_jobs")
      .update({
        enabled: next.enabled,
        schedule_kind: next.schedule_kind,
        schedule_days: next.schedule_days,
        run_at_time: next.run_at_time,
        updated_at: next.updated_at,
      })
      .eq("job_type", PORTFOLIO_JOB_TYPE)
      .select("*")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, job: mapJob(data as Record<string, unknown>) };
  }

  return { ok: false, error: "数据库未连接，无法保存定时任务配置。" };
}

export async function disablePortfolioJobIfNoHoldings(): Promise<boolean> {
  const supabase = await getSupabase();
  const holdings = await holdingsRead(supabase);
  if (holdings.has_current) return false;

  const job = await getPortfolioScheduledJob();
  if (!job.enabled) return false;

  await patchPortfolioScheduledJob({ enabled: false });
  return true;
}

export async function recordScheduledJobRun(input: {
  jobId: string;
  status: ScheduledJobRun["status"];
  conversationId?: string | null;
  reportIndexId?: string | null;
  failureReason?: string | null;
  skipReason?: string | null;
  asOfTradeDate?: string | null;
  reportName?: string | null;
}): Promise<ScheduledJobRun> {
  const triggeredAt = new Date().toISOString();

  const supabase = await getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("scheduled_job_runs")
      .insert({
        job_id: input.jobId,
        triggered_at: triggeredAt,
        status: input.status,
        conversation_id: input.conversationId ?? null,
        report_index_id: input.reportIndexId ?? null,
        failure_reason: input.failureReason ?? null,
        skip_reason: input.skipReason ?? null,
        as_of_trade_date: input.asOfTradeDate ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    const mapped = mapRun(data as Record<string, unknown>);
    mapped.report_name = input.reportName ?? null;

    const job = await getPortfolioScheduledJob();
    const failures =
      input.status === "failed" ? job.consecutive_failures + 1 : 0;
    const patch: Partial<ScheduledJob> = {
      last_run_at: triggeredAt,
      consecutive_failures: failures,
    };
    if (failures >= 3) {
      patch.enabled = false;
    }

    await supabase
      .from("scheduled_jobs")
      .update({
        last_run_at: triggeredAt,
        consecutive_failures: failures,
        enabled: failures >= 3 ? false : job.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return mapped;
  }

  throw new Error("数据库未连接，无法记录定时任务运行日志。");
}

export async function hasRunInLocalMinute(
  jobId: string,
): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;

  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 1);
  const { count } = await supabase
    .from("scheduled_job_runs")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .gte("triggered_at", start.toISOString())
    .lt("triggered_at", end.toISOString());
  return (count ?? 0) > 0;
}

export async function hasManualPortfolioReportToday(localDateKey: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;

  const start = new Date(`${localDateKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data } = await supabase
    .from("report_index")
    .select("id, metadata, generated_at")
    .eq("report_type", "portfolio")
    .gte("generated_at", start.toISOString())
    .lt("generated_at", end.toISOString());

  return (data ?? []).some((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return meta.trigger_source !== "scheduled";
  });
}

export async function listScheduledJobRuns(limit = 50, offset = 0): Promise<ScheduledJobRun[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];

  const job = await getPortfolioScheduledJob();
  const { data } = await supabase
    .from("scheduled_job_runs")
    .select(
      "id, job_id, triggered_at, status, report_index_id, conversation_id, failure_reason, skip_reason, as_of_trade_date",
    )
    .eq("job_id", job.id)
    .order("triggered_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return (data ?? []).map((row) => mapRun(row as Record<string, unknown>));
}
