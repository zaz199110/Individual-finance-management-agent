/**
 * P2 · 投资需求报告生成链路 smoke（Supabase + 可选 LLM 润色）
 * 用法：npx tsx automation/cli/profile-e2e.ts [--goal retirement|...]
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { loadTestEnv } from "../tests/helpers/load-env";
import { getSupabase } from "@/lib/supabase/server";
import { profileRead } from "@/lib/profile/read";
import { draftProfileReport } from "@/lib/profile/report-draft";
import { verifyProfileReportDraft } from "@/harness/tools/profile_report_verify";
import { validateProfileLlmSections } from "@/lib/profile/report-llm-quality";
import {
  ensureTestConversation,
  hasSupabaseEnv,
} from "../tests/helpers/supabase-test";

loadTestEnv(true);

const GOAL_FILTER = process.argv.find((a) => a.startsWith("--goal="))?.split("=")[1];

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

  const profile = await profileRead(supabase);
  console.log(
    `[1] profile_read eligible=${profile.eligible_groups.length} incomplete=${profile.incomplete_groups.length}`,
  );
  if (profile.eligible_groups.length < 1) {
    console.error("[FAIL] 无完善投资需求 · 请先运行 npm run seed:profile-five");
    process.exit(1);
  }

  const targets = GOAL_FILTER
    ? profile.eligible_groups.filter((g) => g.goal_type === GOAL_FILTER)
    : profile.eligible_groups;

  if (targets.length === 0) {
    console.error(`[FAIL] 未找到 goal_type=${GOAL_FILTER}`);
    process.exit(1);
  }

  const conversationId = (await ensureTestConversation("profile")) ?? randomUUID();
  let failed = 0;

  for (const group of targets) {
    const runId = randomUUID();
    console.log(`\n[2] draft ${group.goal_type} (${group.display_name}) …`);

    const draft = await draftProfileReport(supabase, {
      goalConstraintId: group.goal_constraint_id,
      conversationId,
      runId,
    });

    if (!draft.ok) {
      console.error(`  [FAIL] draft: ${draft.error}`);
      failed++;
      continue;
    }

    console.log(`  draft_path: ${draft.draft_path}`);
    console.log(`  report_name: ${draft.report_name}`);
    console.log(`  echarts: ${draft.echarts_count ?? 0}`);
    console.log(
      `  refine: ok=${draft.refine_ok} refined=${draft.refined}${draft.refine_warnings?.length ? ` warn=${draft.refine_warnings.join(";")}` : ""}`,
    );

    const md = fs.readFileSync(draft.draft_path!, "utf8");
    const llmQa = validateProfileLlmSections(md);
    if (!llmQa.ok) {
      console.error(`  [FAIL] LLM section QA: ${llmQa.errors.join("; ")}`);
      failed++;
      continue;
    }

    const verify = verifyProfileReportDraft({
      draftPath: draft.draft_path!,
      goalConstraintId: group.goal_constraint_id,
    });
    if (!verify.ok) {
      console.error(`  [FAIL] verify: ${verify.errors.join("; ")}`);
      failed++;
      continue;
    }
    console.log(`  [OK] verify pass (echarts=${verify.echarts_count})`);
  }

  console.log(`\n=== 完成：${targets.length - failed}/${targets.length} 通过 ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
