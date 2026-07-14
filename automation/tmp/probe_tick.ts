import { tickScheduledJobs } from "../../src/lib/scheduled/scheduler";

async function main() {
  const outcome = await tickScheduledJobs(new Date("2026-06-18T09:00:00+08:00"));
  console.log(JSON.stringify(outcome, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
