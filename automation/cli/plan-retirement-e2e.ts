/**
 * P2 · 退休养老完整链路 smoke（Supabase + 可选联网）
 * 用法：npx tsx automation/cli/plan-retirement-e2e.ts
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadTestEnv } from "../tests/helpers/load-env";
import { getSupabase } from "@/lib/supabase/server";
import { planRead } from "@/lib/plan/read";
import { buildPlanAllocationFormal } from "@/lib/plan/allocation-builder";
import { buildPlanDetailFormal } from "@/lib/plan/detail-builder";
import { planProposeAllocation, planProposeDetail } from "@/lib/plan/propose";
import { planConfirmArtifact } from "@/lib/plan/confirm";
import { draftPlanReport } from "@/lib/plan/report-draft";
import {
  loadSamplePlanAllocation,
  loadSamplePlanDetail,
} from "@/lib/plan/samples";
import { verifyPlanReportDraft } from "@/harness/tools/plan_report_verify";
import {
  ensureTestConversation,
  hasSupabaseEnv,
  needsWebSearch,
} from "../tests/helpers/supabase-test";

export const RETIREMENT_GOAL_ID = "8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f0";

loadTestEnv(true);

async function main(): Promise<void> {
  if (!hasSupabaseEnv()) {
    console.error("[FAIL] 缺少 SUPABASE_URL / KEY（.env.local）");
    process.exit(1);
  }

  const supabase = await getSupabase();
  if (!supabase) {
    console.error("[FAIL] getSupabase() 返回 null");
    process.exit(1);
  }

  const read0 = await planRead(supabase, RETIREMENT_GOAL_ID);
  console.log(`[1] plan_read N=${read0.n} goal=${read0.goal_constraint_id}`);
  if (read0.n < 1) {
    console.error("[FAIL] 无完善投资需求 · 请先运行 seed_profile_five_goals.py");
    process.exit(1);
  }

  const conversationId =
    (await ensureTestConversation("plan")) ?? randomUUID();
  const runId = randomUUID();
  const useFormal = needsWebSearch();
  console.log(`[2] 链路模式：${useFormal ? "正式（联网）" : "样例（无联网 key）"}`);

  let allocArtifactId: string;
  if (useFormal) {
    const built = await buildPlanAllocationFormal(supabase, {
      goalConstraintId: RETIREMENT_GOAL_ID,
    });
    if (!built.ok || !built.payload) {
      console.error("[FAIL] 大类生成:", built.error);
      process.exit(1);
    }
    const propose = await planProposeAllocation(supabase, {
      conversationId,
      runId,
      payload: built.payload,
    });
    if (!propose.ok || !propose.artifact_id) {
      console.error("[FAIL] 大类 propose:", propose.error);
      process.exit(1);
    }
    allocArtifactId = propose.artifact_id;
  } else {
    const sample = loadSamplePlanAllocation(RETIREMENT_GOAL_ID);
    const propose = await planProposeAllocation(supabase, {
      conversationId,
      runId,
      payload: sample,
    });
    if (!propose.ok || !propose.artifact_id) throw new Error(propose.error);
    allocArtifactId = propose.artifact_id;
  }

  const c1 = await planConfirmArtifact(supabase, allocArtifactId);
  if (!c1.ok) {
    console.error("[FAIL] 大类 confirm:", c1.error);
    process.exit(1);
  }
  console.log("[3] 大类已确认 step=1");

  let detailArtifactId: string;
  if (useFormal) {
    const built = await buildPlanDetailFormal(supabase, {
      goalConstraintId: RETIREMENT_GOAL_ID,
    });
    if (!built.ok || !built.payload) {
      console.error("[FAIL] 明细生成:", built.error);
      process.exit(1);
    }
    const propose = await planProposeDetail(supabase, {
      conversationId,
      runId,
      payload: built.payload,
    });
    if (!propose.ok || !propose.artifact_id) {
      console.error("[FAIL] 明细 propose:", propose.error);
      process.exit(1);
    }
    detailArtifactId = propose.artifact_id;
  } else {
    const sample = loadSamplePlanDetail(RETIREMENT_GOAL_ID);
    const propose = await planProposeDetail(supabase, {
      conversationId,
      runId,
      payload: sample,
    });
    if (!propose.ok || !propose.artifact_id) throw new Error(propose.error);
    detailArtifactId = propose.artifact_id;
  }

  const c2 = await planConfirmArtifact(supabase, detailArtifactId);
  if (!c2.ok) {
    console.error("[FAIL] 明细 confirm:", c2.error);
    process.exit(1);
  }
  console.log("[4] 明细已确认 step=2");

  const draft = await draftPlanReport(supabase, {
    goalConstraintId: RETIREMENT_GOAL_ID,
    conversationId,
    runId,
  });
  if (!draft.ok || !draft.draft_path) {
    console.error("[FAIL] 规划书 draft:", draft.error);
    process.exit(1);
  }
  console.log(`[5] 草稿：${draft.report_name}`);
  console.log(`    path: ${draft.draft_path}`);

  const verify = verifyPlanReportDraft({
    draftPath: draft.draft_path,
    goalConstraintId: RETIREMENT_GOAL_ID,
  });
  if (!verify.ok) {
    console.error("[FAIL] verify:", verify.errors.join("；"));
    process.exit(1);
  }
  const head = fs.readFileSync(draft.draft_path, "utf8").slice(0, 120);
  console.log("[6] verify OK · echarts=", verify.echarts_count);
  console.log("--- preview ---");
  console.log(head);
  console.log("[OK] 养老完整链路 smoke 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
