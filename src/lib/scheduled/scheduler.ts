import { ensureTradingCalendarYears } from "@/lib/scheduled/calendar";
import {
  getPortfolioScheduledJob,
  hasRunInLocalMinute,
} from "@/lib/scheduled/jobs";
import {
  formatLocalDateKey,
  readLocalClock,
  shouldAttemptScheduledTick,
} from "@/lib/scheduled/tick-logic";

const TICK_MS = 60_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let started = false;

export async function tickScheduledJobs(now = new Date(), opts?: { force?: boolean }): Promise<{
  checked: boolean;
  result?: Awaited<
    ReturnType<
      typeof import("@/lib/scheduled/executor").runScheduledPortfolioJob
    >
  >;
}> {
  const job = await getPortfolioScheduledJob();
  const clock = readLocalClock(now);

  if (!opts?.force && !shouldAttemptScheduledTick(job, clock)) {
    return { checked: false };
  }

  if (!opts?.force && (await hasRunInLocalMinute(job.id))) {
    return { checked: true, result: { action: "idle" } };
  }

  const year = now.getFullYear();
  void ensureTradingCalendarYears([year, year + 1]).catch(() => {});

  const { runScheduledPortfolioJob } = await import("@/lib/scheduled/executor");
  const result = await runScheduledPortfolioJob(now, { force: opts?.force });
  return { checked: true, result };
}

export function startS14Scheduler(): void {
  if (started) return;
  if (process.env.S14_SCHEDULER_DISABLED === "1") return;
  started = true;

  const year = new Date().getFullYear();
  void ensureTradingCalendarYears([year, year + 1]).catch(() => {});

  void tickScheduledJobs();

  intervalHandle = setInterval(() => {
    void tickScheduledJobs();
  }, TICK_MS);

  if (typeof intervalHandle === "object" && "unref" in intervalHandle) {
    intervalHandle.unref();
  }
}

export function stopS14Scheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}

/** @internal test helper */
export function resetS14SchedulerForTests(): void {
  stopS14Scheduler();
}

export { formatLocalDateKey };
