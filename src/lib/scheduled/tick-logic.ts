import type { ScheduledJob } from "./jobs";

export interface LocalClock {
  /** 0=Sunday … 6=Saturday */
  weekday: number;
  /** 1–31 */
  dayOfMonth: number;
  month: number;
  year: number;
  /** HH:mm */
  hhmm: string;
}

export function readLocalClock(now = new Date()): LocalClock {
  const weekday = now.getDay();
  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return { weekday, dayOfMonth, month, year, hhmm: `${hh}:${mm}` };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** SCH-05: 每月 d 日；若当月无该日则在当月最后一天触发 */
export function effectiveMonthlyDay(day: number, year: number, month: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

export function isScheduleDayMatch(job: ScheduledJob, clock: LocalClock): boolean {
  if (!job.schedule_kind || !job.schedule_days?.length) return false;

  if (job.schedule_kind === "weekly") {
    return job.schedule_days.includes(clock.weekday);
  }

  if (job.schedule_kind === "monthly") {
    return job.schedule_days.some(
      (d) => effectiveMonthlyDay(d, clock.year, clock.month) === clock.dayOfMonth,
    );
  }

  return false;
}

export function isRunTimeMatch(job: ScheduledJob, clock: LocalClock): boolean {
  const target = (job.run_at_time || "09:00").slice(0, 5);
  return clock.hhmm === target;
}

export function shouldAttemptScheduledTick(
  job: ScheduledJob,
  clock: LocalClock,
): boolean {
  if (!job.enabled) return false;
  if (!job.schedule_kind || !job.schedule_days?.length) return false;
  return isScheduleDayMatch(job, clock) && isRunTimeMatch(job, clock);
}

export function formatLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatLocalMinuteKey(now = new Date()): string {
  const clock = readLocalClock(now);
  return `${formatLocalDateKey(now)}T${clock.hhmm}`;
}

export function toShanghaiDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
}
