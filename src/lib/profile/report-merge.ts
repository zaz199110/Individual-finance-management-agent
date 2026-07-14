import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDraftReportPath } from "@/lib/reports/draft-path";
import { validateBasicInfo } from "./basic-info";
import { validateGoalConstraint } from "./goal-constraint";
import { goalDisplayName } from "./goal-labels";
import { normalizeConstraintKeys } from "./constraint-utils";
import {
  buildCrossScenarioSummary,
  buildBasicInfoSection,
  buildProfileReportMarkdown,
  type ProfileReportComposeInput,
} from "./report-blueprint";
import { refineProfileDraftReport } from "./report-refine";
import { stripManualHeadingNumbers } from "@/lib/reports/report-polish";
import type { ReportDraftResult } from "./report-draft";
import type { WorkflowTaskStatus } from "@/lib/chat/task-progress";
import type { BasicInfo, InvestmentConstraints } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

/** DB stores old field names; validators / UI expect new canonical names. */
function normalizeBasicInfoKeys(info: Record<string, unknown>): Record<string, unknown> {
  const basicMap: Record<string, string> = {
    children: "has_children",
    annual_income: "annual_income_after_tax",
    monthly_income: "monthly_income_after_tax",
    risk_preference: "risk_tolerance",
    start_date: "start_invest_date",
    total_debt: "loan_balance_total",
    monthly_debt_payment: "monthly_loan_payment",
    monthly_expense: "monthly_fixed_expense",
  };
  const out: Record<string, unknown> = { ...info };
  for (const [oldKey, newKey] of Object.entries(basicMap)) {
    if (out[oldKey] !== undefined && out[newKey] === undefined) {
      out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  return out;
}



/**
 * Demote markdown headings by one level (H2→H3, H3→H4, etc.).
 * Also strips the top-level H1 heading and the date/subtitle lines
 * that immediately follow it in a per-goal report.
 */
function demoteMarkdownHeadings(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let h1Stripped = false;

  for (const line of lines) {
    // Strip the first H1 heading
    if (!h1Stripped && line.startsWith("# ")) {
      h1Stripped = true;
      continue;
    }

    // Strip the date/subtitle lines immediately following the H1
    if (
      h1Stripped &&
      (line.startsWith("*为您整理") || line.startsWith("*以下为您"))
    ) {
      continue;
    }

    if (line.startsWith("## ")) {
      result.push("###" + line.slice(2)); // H2 → H3
    } else if (line.startsWith("### ")) {
      result.push("####" + line.slice(3)); // H3 → H4
    } else {
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

/**
 * Extracts only the per-goal scenario section (### 2.N {场景名}) from a single-goal
 * report. The merged report already has its own ## 1 (基础信息), ## 3 (合规提示), and
 * ## 4 (AI建议). This function returns just the scenario table so it can be pasted
 * under the merged ## 2 投资场景 heading without duplication.
 */
export function stripDuplicatedSectionsFromGoal(md: string): string {
  const lines = md.split("\n");

  // Strategy A: Find "投资场景" section heading (any level), then the next sub-heading
  let sceneIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s+.*投资场景/i.test(lines[i]!)) {
      sceneIdx = i;
      break;
    }
  }

  let start = -1;
  if (sceneIdx >= 0) {
    // Skip the 投资场景 heading itself and any non-heading lines (metadata)
    for (let i = sceneIdx + 1; i < lines.length; i++) {
      if (/^#{3,5}\s+/.test(lines[i]!)) {
        start = i;
        break;
      }
    }
  }

  // Strategy B: Fallback to pre-polish pattern (### 2.N)
  if (start < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/^#{3,4}\s+2\.\d+\s/.test(lines[i]!)) {
        start = i;
        break;
      }
    }
  }

  if (start < 0) return "";

  // Collect from heading until --- separator (or end of file)
  const result: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") break;
    result.push(line);
  }

  return result.join("\n").trim();
}

function getMarkerPath(conversationId: string, runId: string): string {
  return path.join(
    path.dirname(getDraftReportPath(conversationId, runId)),
    `profile-report.${runId}.json`,
  );
}

// ─── main export ────────────────────────────────────────────────────────────

export type ReportProgressCallback = (
  taskKey: string,
  status: WorkflowTaskStatus,
) => void | Promise<void>;

export async function draftAllGoalsProfileReport(
  supabase: SupabaseClient,
  params: { conversationId: string; runId: string; sessionId: string },
  onProgress?: ReportProgressCallback,
): Promise<ReportDraftResult> {
  const { conversationId, runId } = params;

  // 1. Query all confirmed goals
  const { data: goalRows, error: queryError } = await supabase
    .from("investment_goal_constraints")
    .select(
      "id, goal_type, display_name, profile_version_id, goal_detail, investment_constraints, principal_amount, monthly_amount",
    )
    .not("confirmed_at", "is", null)
    .eq("is_active", true)
    .order("confirmed_at", { ascending: true });

  if (queryError) {
    await onProgress?.("profile.rpt.draft.gather", "failed");
    return { ok: false, error: `查询已确认投资需求失败: ${queryError.message}` };
  }

  const goals = goalRows ?? [];
  await onProgress?.("profile.rpt.draft.gather", "done");

  // Edge case: no confirmed goals
  if (goals.length === 0) {
    const fallbackMd = `# 投资需求报告\n\n*暂无已确认的投资需求*`;
    const reportPath = getDraftReportPath(conversationId, runId);
    const reportDir = path.dirname(reportPath);
    const markerPath = getMarkerPath(conversationId, runId);

    try {
      await mkdir(reportDir, { recursive: true });
      await writeFile(reportPath, fallbackMd, "utf8");
      await writeFile(
        markerPath,
        JSON.stringify(
          {
            conversationId,
            runId,
            goalCount: 0,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `写入合并报告文件失败: ${msg}` };
    }

    return { ok: true, draft_path: reportPath, echarts_count: 0 };
  }

  // Build per-goal sections
  interface GoalSection {
    index: number;
    sceneName: string;
    markdown: string;
    relativeMetrics: ReturnType<typeof buildProfileReportMarkdown>["relativeMetrics"];
    understandingDraft: string;
    echartsCount: number;
    error?: string;
  }

  // Helper: process a single goal (validation + template + refinement)
  async function processGoal(
    goal: (typeof goals)[number],
    index: number,
  ): Promise<GoalSection & { basicInfo?: BasicInfo }> {
    const section: GoalSection = {
      index: index + 1,
      sceneName: goalDisplayName(goal.goal_type, goal.display_name),
      markdown: "",
      relativeMetrics: { risk_coherence: "" },
      understandingDraft: "",
      echartsCount: 0,
    };

    // Validate basic info from profile_versions
    const { data: profile } = await supabase
      .from("profile_versions")
      .select("basic_info")
      .eq("id", goal.profile_version_id)
      .maybeSingle();

    const normalizedBasic = normalizeBasicInfoKeys(
      (profile?.basic_info ?? {}) as Record<string, unknown>,
    );
    const basicValidation = validateBasicInfo(normalizedBasic);
    if (!basicValidation.ok || !basicValidation.data) {
      section.error = "客户信息层不完整";
      return section;
    }

    // Validate goal constraint — normalize constraint keys and merge principal/monthly
    const rawConstraints = (
      goal.investment_constraints ?? {}
    ) as Record<string, unknown>;
    if (goal.principal_amount != null && rawConstraints.principal_amount == null) {
      rawConstraints.principal_amount = goal.principal_amount;
    }
    if (goal.monthly_amount != null && rawConstraints.monthly_amount == null) {
      rawConstraints.monthly_amount = goal.monthly_amount;
    }
    const normalizedConstraints = normalizeConstraintKeys(rawConstraints, {
      goalId: `#${index + 1}_${goal.goal_type}`,
    });

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
      section.error = "投资需求组数据无效";
      return section;
    }

    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
    const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    const composeInput: ProfileReportComposeInput = {
      sceneName: section.sceneName,
      goalType: goal.goal_type,
      dateLabel,
      ymd,
      basicInfo: basicValidation.data as BasicInfo,
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

    try {
      const composed = buildProfileReportMarkdown(composeInput);
      section.markdown = composed.markdown;
      section.relativeMetrics = composed.relativeMetrics;
      section.understandingDraft = composed.understandingDraft;
      section.echartsCount = composed.echartsCount;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      section.error = `报告生成失败: ${msg}`;
      return section;
    }

    // Refine the per-goal markdown (the expensive LLM part)
    const tempDir = path.join(
      path.dirname(getDraftReportPath(conversationId, runId)),
      "merge-temp",
    );
    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch {
      // directory may already exist
    }

    const tempDraftPath = path.join(tempDir, `goal-${section.index}.md`);
    try {
      fs.writeFileSync(tempDraftPath, section.markdown, "utf8");
    } catch {
      return section;
    }

    try {
      const refineResult = await refineProfileDraftReport({
        draftPath: tempDraftPath,
        sceneName: section.sceneName,
        relativeMetrics: section.relativeMetrics,
        understandingDraft: section.understandingDraft,
      });

      if (refineResult.ok && fs.existsSync(tempDraftPath)) {
        section.markdown = fs.readFileSync(tempDraftPath, "utf8");
      }
    } catch {
      // Refinement failed, use original markdown
    }

    return { ...section, basicInfo: basicValidation.data as BasicInfo };
  }

  // Run all goals in parallel (refinement LLM calls are the bottleneck)
  const sectionResults = await Promise.allSettled(
    goals.map((goal, i) => processGoal(goal, i)),
  );

  // Collect results in order and accumulate side effects
  const sections: GoalSection[] = [];
  let totalEchartsCount = 0;
  let savedBasicInfo: BasicInfo | undefined;

  for (let i = 0; i < sectionResults.length; i++) {
    const result = sectionResults[i]!;
    if (result.status === "fulfilled") {
      const { basicInfo, ...section } = result.value;
      sections.push(section);
      if (!savedBasicInfo && basicInfo) {
        savedBasicInfo = basicInfo;
      }
      totalEchartsCount += section.echartsCount;
    } else {
      sections.push({
        index: i + 1,
        sceneName: goalDisplayName(goals[i]!.goal_type, goals[i]!.display_name),
        error: result.reason instanceof Error ? result.reason.message : "报告生成失败",
        markdown: "",
        relativeMetrics: { risk_coherence: "" },
        understandingDraft: "",
        echartsCount: 0,
      });
    }
  }

  await onProgress?.("profile.rpt.draft.compose", "done");

  // Build cross-scenario summary
  let crossScenarioSummary: string | null = null;
  let totalMonthlyInvest = 0;
  if (savedBasicInfo) {
    const goalSummaries: Array<{
      sceneName: string;
      goalType: string;
      principalAmount: number;
      monthlyAmount: number;
    }> = [];
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].error) continue;
      const ma = goals[i].monthly_amount;
      totalMonthlyInvest += ma;
      goalSummaries.push({
        sceneName: sections[i].sceneName,
        goalType: goals[i].goal_type,
        principalAmount: goals[i].principal_amount,
        monthlyAmount: goals[i].monthly_amount,
      });
    }
    crossScenarioSummary = await buildCrossScenarioSummary(savedBasicInfo, goalSummaries);
  }

  await onProgress?.("profile.rpt.draft.cross", "done");

  // Build basic info section for merged report
  const basicInfoSection = savedBasicInfo
    ? buildBasicInfoSection(savedBasicInfo, totalMonthlyInvest)
    : null;

  // ── H1 title ──
  const today = new Date();
  const reportName = `投资需求综合报告-${today.toISOString().slice(0, 10).replace(/-/g, "")}`;
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const mergedParts: string[] = [];
  mergedParts.push(`# ${reportName}`);
  mergedParts.push("");
  mergedParts.push(`*为您整理 · ${dateLabel}*`);
  mergedParts.push("");
  mergedParts.push("---");
  mergedParts.push("");

  // Add basic info section at the top
  if (basicInfoSection) {
    mergedParts.push(basicInfoSection);
    mergedParts.push(``);
    mergedParts.push(`---`);
    mergedParts.push(``);
  }

  // Add investment scenarios section header
  mergedParts.push(`## 2 投资场景`);
  mergedParts.push(``);

  for (const section of sections) {
    if (section.error) {
      mergedParts.push(`---`);
      mergedParts.push(``);
      mergedParts.push(`### 2.${section.index} ${section.sceneName}`);
      mergedParts.push(``);
      mergedParts.push(`*本需求报告生成失败*`);
      mergedParts.push(``);
      continue;
    }

    const stripped = stripDuplicatedSectionsFromGoal(section.markdown);
    mergedParts.push(`---`);
    mergedParts.push(``);
    mergedParts.push(`### 2.${section.index} ${section.sceneName}`);
    mergedParts.push(``);
    // Remove any leading ### heading from the stripped markdown to avoid duplication
    // (buildGoalScenarioTable already generates one)
    // Tolerate both "### 2.1 场景名" (pre-polish) and "### 场景名" (post-polish) formats
    const cleanedStripped = stripped.replace(/^###\s+(?:2\.\d+\s+)?[^\n]*\n+/, "");
    mergedParts.push(cleanedStripped);
    mergedParts.push(``);
  }

  // Add cross-scenario AI summary at the end
  // crossScenarioSummary already includes its own "## 3 AI建议" heading from buildAiAdviceDraft
  if (crossScenarioSummary) {
    mergedParts.push(`---`);
    mergedParts.push(``);
    mergedParts.push(crossScenarioSummary);
    mergedParts.push(``);
  }

  // Add compliance disclaimer
  mergedParts.push(`---`);
  mergedParts.push(``);
  mergedParts.push(`## 4 合规提示`);
  mergedParts.push(``);
  mergedParts.push(`> 本报告由AI基于您提供的信息生成，仅供参考，不构成投资建议。`);
  mergedParts.push(``);

  const mergedMarkdown = mergedParts.join("\n");
  const polished = stripManualHeadingNumbers(mergedMarkdown);

  // Write to disk
  const reportPath = getDraftReportPath(conversationId, runId);
  const reportDir = path.dirname(reportPath);
  const markerPath = getMarkerPath(conversationId, runId);

  try {
    await mkdir(reportDir, { recursive: true });
    await writeFile(reportPath, polished, "utf8");
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          conversationId,
          runId,
          goalCount: goals.length,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `写入合并报告文件失败: ${msg}` };
  }

  // Verify the merged report (dynamic import to avoid bundling issues)
  let verifyWarnings: string[] = [];
  try {
    const { verifyProfileReportDraft } = await import(
      "@/harness/tools/profile_report_verify"
    );
    const verify = verifyProfileReportDraft({
      draftPath: reportPath,
    });
    if (!verify.ok) {
      // Verification failures become warnings since the merged format differs
      verifyWarnings = [...verify.errors, ...verify.warnings];
    } else if (verify.warnings.length > 0) {
      verifyWarnings = verify.warnings;
    }
  } catch {
    // Verification module unavailable — non-blocking
  }

  await onProgress?.("profile.rpt.draft.merge", "done");

  return {
    ok: true,
    draft_path: reportPath,
    echarts_count: totalEchartsCount,
    verify_warnings: verifyWarnings.length > 0 ? verifyWarnings : undefined,
  };
}
