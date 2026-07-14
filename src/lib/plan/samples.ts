import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "@/lib/paths";
import type { PlanAllocationPayload, PlanDetailPayload } from "./types";

let cached: {
  plan_allocation: PlanAllocationPayload;
  plan_detail: PlanDetailPayload;
} | null = null;

function loadExamples(): {
  plan_allocation: PlanAllocationPayload;
  plan_detail: PlanDetailPayload;
} {
  if (cached) return cached;
  const p = path.join(
    getProjectRoot(),
    "requirement/docs/samples/plan-propose-payload.examples.json",
  );
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
    plan_allocation: PlanAllocationPayload;
    plan_detail: PlanDetailPayload;
  };
  cached = raw;
  return raw;
}

export function loadSamplePlanAllocation(
  goalConstraintId?: string,
  profileVersionId?: string,
): PlanAllocationPayload {
  const sample = structuredClone(loadExamples().plan_allocation);
  if (goalConstraintId) sample.goal_constraint_id = goalConstraintId;
  if (profileVersionId) sample.profile_version_id = profileVersionId;
  return sample;
}

export function loadSamplePlanDetail(
  goalConstraintId?: string,
  profileVersionId?: string,
): PlanDetailPayload {
  const sample = structuredClone(loadExamples().plan_detail);
  if (goalConstraintId) sample.goal_constraint_id = goalConstraintId;
  if (profileVersionId) sample.profile_version_id = profileVersionId;
  return sample;
}
