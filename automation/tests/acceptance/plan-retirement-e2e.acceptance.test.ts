import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase/server";
import { planRead } from "@/lib/plan/read";
import { profileRead } from "@/lib/profile/read";
import { buildPlanAllocationFormal } from "@/lib/plan/allocation-builder";
import { buildPlanDetailFormal } from "@/lib/plan/detail-builder";
import { planProposeAllocation, planProposeDetail } from "@/lib/plan/propose";
import { planConfirmArtifact } from "@/lib/plan/confirm";
import { draftPlanReport } from "@/lib/plan/report-draft";
import { loadSamplePlanAllocation, loadSamplePlanDetail } from "@/lib/plan/samples";
import { verifyPlanReportDraft } from "@/harness/tools/plan_report_verify";
import { screenAllCategories } from "@/lib/plan/screen-funds";
import {
  ensureTestConversation,
  hasSupabaseEnv,
  needsWebSearch,
} from "../helpers/supabase-test";

export const RETIREMENT_GOAL_ID = "8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f0";
const ALL_GOAL_IDS = [
  RETIREMENT_GOAL_ID,
  "8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f1",
  "9a1b2c3d-4e5f-6789-abcd-ef1234567891",
  "9a1b2c3d-4e5f-6789-abcd-ef1234567892",
  "9a1b2c3d-4e5f-6789-abcd-ef1234567893",
];

describe("P2 plan · five-scenario seed", () => {
  it("profileRead eligible_groups = 5 after seed", async () => {
    if (!hasSupabaseEnv()) return;
    const supabase = await getSupabase();
    if (!supabase) return;
    const profile = await profileRead(supabase);
    expect(profile.eligible_groups.length).toBeGreaterThanOrEqual(5);
    for (const id of ALL_GOAL_IDS) {
      expect(profile.eligible_groups.some((g) => g.goal_constraint_id === id)).toBe(true);
    }
  });

  it("planRead N=5", async () => {
    if (!hasSupabaseEnv()) return;
    const supabase = await getSupabase();
    if (!supabase) return;
    const read = await planRead(supabase);
    expect(read.n).toBeGreaterThanOrEqual(5);
  });

  it("plan_screen_funds returns candidates for 3 categories", async () => {
    const screened = await screenAllCategories();
    expect(screened["股票类"].length).toBeGreaterThan(0);
    expect(screened["债券类"].length).toBeGreaterThan(0);
    expect(screened["货币类"].length).toBeGreaterThan(0);
    expect(
      [...screened["股票类"], ...screened["债券类"], ...screened["货币类"]].every(
        (f) => !/商品|黄金/.test(f.fund_type),
      ),
    ).toBe(true);
  });
});

describe("P2 plan · retirement full chain", () => {
  it(
    "step1 → step2 → draft → verify",
    async () => {
      if (!hasSupabaseEnv()) return;
      const supabase = await getSupabase();
      if (!supabase) return;

      const read = await planRead(supabase, RETIREMENT_GOAL_ID);
      expect(read.n).toBeGreaterThanOrEqual(1);

      const conversationId =
        (await ensureTestConversation("plan")) ?? randomUUID();
      const runId = randomUUID();
      const useFormal = needsWebSearch();

      if (useFormal) {
        const a = await buildPlanAllocationFormal(supabase, {
          goalConstraintId: RETIREMENT_GOAL_ID,
        });
        expect(a.ok, a.error).toBe(true);
        const pa = await planProposeAllocation(supabase, {
          conversationId,
          runId,
          payload: a.payload!,
        });
        expect(pa.ok, pa.error).toBe(true);
        expect(await planConfirmArtifact(supabase, pa.artifact_id!)).toMatchObject({
          ok: true,
          plan_step: 1,
        });

        const d = await buildPlanDetailFormal(supabase, {
          goalConstraintId: RETIREMENT_GOAL_ID,
        });
        expect(d.ok, d.error).toBe(true);
        const pd = await planProposeDetail(supabase, {
          conversationId,
          runId,
          payload: d.payload!,
        });
        expect(pd.ok, pd.error).toBe(true);
        expect(await planConfirmArtifact(supabase, pd.artifact_id!)).toMatchObject({
          ok: true,
          plan_step: 2,
        });
      } else {
        const pa = await planProposeAllocation(supabase, {
          conversationId,
          runId,
          payload: loadSamplePlanAllocation(RETIREMENT_GOAL_ID),
        });
        expect(pa.ok).toBe(true);
        await planConfirmArtifact(supabase, pa.artifact_id!);
        const pd = await planProposeDetail(supabase, {
          conversationId,
          runId,
          payload: loadSamplePlanDetail(RETIREMENT_GOAL_ID),
        });
        expect(pd.ok).toBe(true);
        await planConfirmArtifact(supabase, pd.artifact_id!);
      }

      const draft = await draftPlanReport(supabase, {
        goalConstraintId: RETIREMENT_GOAL_ID,
        conversationId,
        runId,
      });
      expect(draft.ok, draft.error).toBe(true);
      expect(draft.report_name).toMatch(/退休养老-资产配置方案-/);
      expect(fs.existsSync(draft.draft_path!)).toBe(true);

      const verify = verifyPlanReportDraft({
        draftPath: draft.draft_path!,
        goalConstraintId: RETIREMENT_GOAL_ID,
      });
      expect(verify.errors, verify.errors.join("；")).toEqual([]);
      expect(verify.echarts_count).toBeGreaterThanOrEqual(3);
    },
    180_000,
  );
});
