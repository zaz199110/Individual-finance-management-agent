import { describe, expect, it } from "vitest";
import type { ScheduledJob } from "@/lib/scheduled/jobs";
import {
  effectiveMonthlyDay,
  isScheduleDayMatch,
  isRunTimeMatch,
  shouldAttemptScheduledTick,
} from "@/lib/scheduled/tick-logic";

const baseJob: ScheduledJob = {
  id: "j1",
  job_type: "portfolio",
  enabled: true,
  schedule_kind: "weekly",
  schedule_days: [3],
  run_at_time: "09:00",
  consecutive_failures: 0,
  updated_at: new Date().toISOString(),
  last_run_at: null,
};

describe("scheduled tick-logic", () => {
  it("weekly matches weekday", () => {
    expect(
      isScheduleDayMatch(baseJob, {
        weekday: 3,
        dayOfMonth: 10,
        month: 6,
        year: 2026,
        hhmm: "09:00",
      }),
    ).toBe(true);
    expect(
      isScheduleDayMatch(baseJob, {
        weekday: 2,
        dayOfMonth: 10,
        month: 6,
        year: 2026,
        hhmm: "09:00",
      }),
    ).toBe(false);
  });

  it("monthly short month uses last day", () => {
    expect(effectiveMonthlyDay(31, 2026, 2)).toBe(28);
    const job: ScheduledJob = {
      ...baseJob,
      schedule_kind: "monthly",
      schedule_days: [31],
    };
    expect(
      isScheduleDayMatch(job, {
        weekday: 6,
        dayOfMonth: 28,
        month: 2,
        year: 2026,
        hhmm: "09:00",
      }),
    ).toBe(true);
  });

  it("requires exact minute for run time", () => {
    const clock = {
      weekday: 3,
      dayOfMonth: 10,
      month: 6,
      year: 2026,
      hhmm: "09:00",
    };
    expect(isRunTimeMatch(baseJob, clock)).toBe(true);
    expect(isRunTimeMatch(baseJob, { ...clock, hhmm: "09:01" })).toBe(false);
    expect(shouldAttemptScheduledTick(baseJob, clock)).toBe(true);
    expect(shouldAttemptScheduledTick({ ...baseJob, enabled: false }, clock)).toBe(
      false,
    );
  });
});
