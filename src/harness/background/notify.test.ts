import { describe, expect, it, vi } from "vitest";
import { emitJobStage, subscribeJobStage } from "./notify";

describe("subscribeJobStage", () => {
  it("delivers stage events to conversation listeners", () => {
    const listener = vi.fn();
    const unsub = subscribeJobStage("conv-1", listener);

    emitJobStage("conv-1", {
      job_id: "job-1",
      event: "stage",
      data: { task_key: "fund.prep.intent", label: "理解您的解读需求", status: "running" },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].job_id).toBe("job-1");

    unsub();
    emitJobStage("conv-1", {
      job_id: "job-1",
      event: "stage",
      data: { task_key: "fund.prep.lookup", status: "running" },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
