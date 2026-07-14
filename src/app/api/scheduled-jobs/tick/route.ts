import { tickScheduledJobs } from "@/lib/scheduled/scheduler";

let schedulerStarted = false;

async function ensureProductionScheduler(): Promise<void> {
  if (schedulerStarted) return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.S14_SCHEDULER_DISABLED === "1") return;
  schedulerStarted = true;
  const { startS14Scheduler } = await import("@/lib/scheduled/scheduler");
  startS14Scheduler();
}

export async function POST(request: Request) {
  await ensureProductionScheduler();
  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // body may be empty or not JSON-parsable — treat as no force
  }
  const outcome = await tickScheduledJobs(new Date(), { force });
  return Response.json(outcome);
}
