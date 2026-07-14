import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { getRunsDir } from "@/lib/paths";
import { validateBasicInfo } from "@/lib/profile/basic-info";
import { validateGoalConstraint } from "@/lib/profile/goal-constraint";
import { goalDisplayName } from "@/lib/profile/goal-labels";
import {
  buildProfileReportMarkdown,
  buildBasicInfoSection,
  buildAiAdviceDraft,
  type ProfileReportComposeInput,
} from "@/lib/profile/report-blueprint";
import type { BasicInfo, InvestmentConstraints } from "@/lib/profile/types";
import { stripDuplicatedSectionsFromGoal } from "@/lib/profile/report-merge";
import { stripManualHeadingNumbers } from "@/lib/reports/report-polish";

const MERGED_RUN_ID = "profile-merged";

// ---------------------------------------------------------------------------
// Field-name normalization: DB keys → UI keys
// Reused from /api/profile/current — keep in sync.
// ---------------------------------------------------------------------------

const BASIC_INFO_KEY_MAP: Record<string, string> = {
  children: "has_children",
  annual_income: "annual_income_after_tax",
  monthly_income: "monthly_income_after_tax",
  total_debt: "loan_balance_total",
  monthly_debt_payment: "monthly_loan_payment",
  monthly_expense: "monthly_fixed_expense",
};

const CONSTRAINT_KEY_MAP: Record<string, string> = {
  risk_preference: "risk_tolerance",
  target_annual_return: "target_return",
  expected_return: "target_return",
  start_date: "start_invest_date",
  target_date: "money_needed_date",
  monthly_retirement_payout: "monthly_retirement_spending",
  investment_horizon_years: "investment_duration",
  investment_horizon: "investment_duration",
};

function normalizeKeys(
  obj: Record<string, unknown>,
  keyMap: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = keyMap[key] ?? key;
    result[newKey] = value;
  }
  return result;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    conversation_id?: string;
  };

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "数据库未连接。" },
      { status: 503 },
    );
  }

  // 1. Get current profile version
  const { data: profileVersion, error: profileError } = await supabase
    .from("profile_versions")
    .select("id, basic_info")
    .eq("is_current", true)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: `查询画像版本失败: ${profileError.message}` },
      { status: 500 },
    );
  }

  if (!profileVersion?.basic_info) {
    return NextResponse.json(
      { ok: false, error: "暂无基本信息，无法生成报告。" },
      { status: 400 },
    );
  }

  // 2. Normalize basic-info keys (DB → UI), then validate
  const rawBasicInfo = profileVersion.basic_info as Record<string, unknown>;
  const normalizedBasicInfo = normalizeKeys(rawBasicInfo, BASIC_INFO_KEY_MAP);
  const basicValidation = validateBasicInfo(normalizedBasicInfo);
  if (!basicValidation.ok || !basicValidation.data) {
    return NextResponse.json(
      { ok: false, error: "基本信息不完整，无法生成报告。" },
      { status: 400 },
    );
  }

  // 3. Get confirmed goals
  const { data: goalRows, error: goalError } = await supabase
    .from("investment_goal_constraints")
    .select(
      "id, goal_type, display_name, profile_version_id, goal_detail, investment_constraints, principal_amount, monthly_amount",
    )
    .not("confirmed_at", "is", null)
    .eq("is_active", true)
    .order("confirmed_at", { ascending: true });

  if (goalError) {
    return NextResponse.json(
      { ok: false, error: `查询投资需求失败: ${goalError.message}` },
      { status: 500 },
    );
  }

  if (!goalRows || goalRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "暂无已确认的投资需求，无法生成报告。" },
      { status: 400 },
    );
  }

  // 4. Generate report sections for each goal
  const basicInfo = basicValidation.data as BasicInfo;
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const goalScenarios: string[] = [];
  const scenarioData: Array<Record<string, unknown>> = [];
  let totalMonthlyInvest = 0;

  for (const goal of goalRows) {
    const rawConstraints = (goal.investment_constraints ?? {}) as Record<string, unknown>;
    // Merge principal_amount & monthly_amount into constraints (they are stored as separate columns)
    const normalizedConstraints = normalizeKeys(
      {
        ...rawConstraints,
        principal_amount: goal.principal_amount,
        monthly_amount: goal.monthly_amount,
      },
      CONSTRAINT_KEY_MAP,
    );

    const goalPayload = validateGoalConstraint({
      kind: "goal_constraint",
      goal_type: goal.goal_type,
      goal_detail: goal.goal_detail,
      investment_constraints: normalizedConstraints,
      principal_amount: goal.principal_amount,
      monthly_amount: goal.monthly_amount,
      goal_display_name: goal.display_name,
      profile_version_id: goal.profile_version_id,
    });

    if (!goalPayload.ok || !goalPayload.data) {
      continue;
    }

    const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
    totalMonthlyInvest += goal.monthly_amount;

    const composeInput: ProfileReportComposeInput = {
      sceneName,
      goalType: goal.goal_type,
      dateLabel,
      ymd,
      basicInfo,
      constraints: goalPayload.data.investment_constraints as InvestmentConstraints,
      principalAmount:
        (
          goalPayload.data.investment_constraints as unknown as Record<string, unknown>
        ).principal_amount as number,
      monthlyAmount:
        (
          goalPayload.data.investment_constraints as unknown as Record<string, unknown>
        ).monthly_amount as number,
    };

    scenarioData.push({
      goal_type: goal.goal_type,
      display_name: sceneName,
      constraints: goalPayload.data.investment_constraints,
      monthlyAmount: composeInput.monthlyAmount,
      principalAmount: composeInput.principalAmount,
    });

    try {
      const composed = buildProfileReportMarkdown(composeInput);
      // Keep only the scenario table (strip duplicated sections from goal markdown)
      const stripped = stripDuplicatedSectionsFromGoal(composed.markdown);
      goalScenarios.push(stripped || composed.markdown);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      goalScenarios.push(`## ${sceneName}\n\n报告生成失败: ${msg}`);
    }
  }

  // 5. Build complete merged markdown
  const reportName = `投资需求综合报告-${ymd}`;
  const mergedParts: string[] = [];

  // ── H1 title ──
  mergedParts.push(`# ${reportName}`);
  mergedParts.push("");
  mergedParts.push(`*为您整理 · ${dateLabel}*`);
  mergedParts.push("");

  // ── Section 1: 基本信息 (with ECharts) ──
  mergedParts.push(buildBasicInfoSection(basicInfo, totalMonthlyInvest));
  mergedParts.push("");
  mergedParts.push("---");
  mergedParts.push("");

  // ── Section 2: 投资场景 (per-goal tables) ──
  mergedParts.push("## 2 投资场景");
  mergedParts.push("");
  for (let i = 0; i < goalRows.length; i++) {
    const goal = goalRows[i];
    const sceneName = goalDisplayName(goal.goal_type, goal.display_name);
    mergedParts.push("---");
    mergedParts.push("");
    mergedParts.push(`### 2.${i + 1} ${sceneName}`);
    mergedParts.push("");
    // stripDuplicatedSectionsFromGoal strips the goal's own ## heading,
    // so the scenario table content is what remains. The ### heading above
    // is added here — don't let buildGoalScenarioTable add a duplicate.
    const goalMd = goalScenarios[i] ?? "*本需求报告生成失败*";
    // Remove any leading ### heading from the goal markdown to avoid duplication
    const cleanedGoalMd = goalMd.replace(/^###\s+2\.\d+\s+[^\n]*\n+/, "");
    mergedParts.push(cleanedGoalMd);
    mergedParts.push("");
  }

  // ── Section 3: AI建议 ──
  mergedParts.push("---");
  mergedParts.push("");
  mergedParts.push(buildAiAdviceDraft(basicInfo, scenarioData));
  mergedParts.push("");

  // ── Section 4: 合规提示 ──
  mergedParts.push("---");
  mergedParts.push("");
  mergedParts.push("## 4 合规提示");
  mergedParts.push("");
  mergedParts.push("> 本报告由AI基于您提供的信息生成，仅供参考，不构成投资建议。");
  mergedParts.push("");

  const finalMd = stripManualHeadingNumbers(mergedParts.join("\n"));

  // 6. Write draft file + set metadata if conversation_id provided
  let filePath: string | undefined;

  if (body.conversation_id) {
    const runDir = path.join(
      getRunsDir(),
      body.conversation_id,
      MERGED_RUN_ID,
    );
    fs.mkdirSync(runDir, { recursive: true });
    filePath = path.join(runDir, "draft-report.md");
    fs.writeFileSync(filePath, finalMd, "utf8");

    // Set pending_report_draft metadata
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", body.conversation_id)
      .maybeSingle();

    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;

    try {
      await supabase
        .from("conversations")
        .update({
          metadata: {
            ...meta,
            pending_report_draft: {
              report_type: "profile",
              report_name: reportName,
              file_path: filePath,
              run_id: MERGED_RUN_ID,
            },
            has_unconfirmed: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.conversation_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generate-report] 会话元数据更新失败: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    markdown: finalMd,
    report_name: reportName,
    goal_count: goalRows.length,
    file_path: filePath,
  });
}
