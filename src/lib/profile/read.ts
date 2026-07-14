import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBasicInfoSummary, validateBasicInfo } from "./basic-info";
import { GOAL_TYPES, goalPickLabel } from "./goal-constraint";
import { goalDisplayName } from "./goal-labels";
import type { BasicInfo, GoalConstraintProposePayload, ProfileGroupSummary, ProfileReadResult } from "./types";

interface GoalRow {
  id: string;
  goal_type: string;
  display_name: string | null;
  profile_version_id: string;
  confirmed_at: string;
  is_active: boolean;
}

interface RevisionRow {
  id: string;
  goal_constraint_id: string;
  revision_no: number;
}

interface ReportRow {
  profile_version_id: string | null;
  goal_constraint_revision_id: string | null;
}

async function getCurrentProfileId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("profile_versions")
    .select("id, basic_info")
    .eq("is_current", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getCurrentBasicInfo(
  supabase: SupabaseClient,
): Promise<BasicInfo | null> {
  const { data } = await supabase
    .from("profile_versions")
    .select("basic_info")
    .eq("is_current", true)
    .maybeSingle();

  const raw = data?.basic_info;
  if (!raw || typeof raw !== "object") return null;

  const v = validateBasicInfo(raw);
  return v.data ?? null;
}

async function isGroupEligible(
  supabase: SupabaseClient,
  goal: GoalRow,
  currentProfileId: string | null,
): Promise<boolean> {
  if (!goal.is_active || !goal.confirmed_at || !currentProfileId) return false;
  if (goal.profile_version_id !== currentProfileId) return false;

  const { data: revisions } = await supabase
    .from("goal_constraint_revisions")
    .select("id, revision_no")
    .eq("goal_constraint_id", goal.id)
    .order("revision_no", { ascending: false })
    .limit(1);

  const latestRevision = revisions?.[0] as RevisionRow | undefined;
  if (!latestRevision) return false;

  const { data: reports } = await supabase
    .from("report_index")
    .select("profile_version_id, goal_constraint_revision_id")
    .eq("report_type", "profile")
    .eq("goal_constraint_id", goal.id)
    .order("generated_at", { ascending: false })
    .limit(1);

  const rep = reports?.[0] as ReportRow | undefined;
  if (!rep) return false;

  return (
    rep.profile_version_id === currentProfileId &&
    rep.goal_constraint_revision_id === latestRevision.id
  );
}

function toGroupSummary(goal: GoalRow): ProfileGroupSummary {
  return {
    goal_constraint_id: goal.id,
    goal_type: goal.goal_type,
    display_name: goalDisplayName(goal.goal_type, goal.display_name),
  };
}

export async function profileRead(
  supabase: SupabaseClient | null,
): Promise<ProfileReadResult> {
  const empty: ProfileReadResult = {
    profile_version_id: null,
    has_basic_info: false,
    basic_info_summary: null,
    eligible_groups: [],
    incomplete_groups: [],
    active_constraint_count: 0,
  };

  if (!supabase) return empty;

  const { data: currentProfile } = await supabase
    .from("profile_versions")
    .select("id, basic_info")
    .eq("is_current", true)
    .maybeSingle();

  const profileVersionId = currentProfile?.id ?? null;
  const basicInfo = currentProfile?.basic_info as Record<string, unknown> | undefined;

  const { data: goals } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name, profile_version_id, confirmed_at, is_active")
    .eq("is_active", true);

  const activeGoals = (goals ?? []) as GoalRow[];
  const eligible_groups: ProfileGroupSummary[] = [];
  const incomplete_groups: ProfileGroupSummary[] = [];

  for (const goal of activeGoals) {
    const summary = toGroupSummary(goal);
    const eligible = await isGroupEligible(supabase, goal, profileVersionId);
    if (eligible) {
      eligible_groups.push(summary);
    } else if (goal.confirmed_at) {
      incomplete_groups.push(summary);
    }
  }

  let basicSummary: string | null = null;
  if (
    basicInfo &&
    typeof basicInfo.name === "string" &&
    typeof basicInfo.age === "number"
  ) {
    basicSummary = formatBasicInfoSummary({
      name: String(basicInfo.name),
      age: Number(basicInfo.age),
      gender: String(basicInfo.gender ?? ""),
      marital_status: String(basicInfo.marital_status ?? ""),
      has_children: String(basicInfo.has_children ?? ""),
      occupation: String(basicInfo.occupation ?? ""),
      investment_experience: String(basicInfo.investment_experience ?? ""),
      annual_income_after_tax: Number(basicInfo.annual_income_after_tax ?? 0),
      monthly_income_after_tax: Number(basicInfo.monthly_income_after_tax ?? 0),
      financial_assets: Number(basicInfo.financial_assets ?? 0),
      loan_balance_total: Number(basicInfo.loan_balance_total ?? 0),
      monthly_loan_payment: Number(basicInfo.monthly_loan_payment ?? 0),
      monthly_fixed_expense: Number(basicInfo.monthly_fixed_expense ?? 0),
      monthly_investable: Number(basicInfo.monthly_investable ?? 0),
    });
  }

  return {
    profile_version_id: profileVersionId,
    has_basic_info: Boolean(profileVersionId),
    basic_info_summary: basicSummary,
    eligible_groups,
    incomplete_groups,
    active_constraint_count: activeGoals.length,
  };
}

export { buildProfilePlaceholder, buildProfilePlaceholderHint } from "./placeholder";
export type { ProfilePlaceholder } from "./placeholder";

/**
 * 获取指定场景的当前投资目标约束数据
 */
export async function getCurrentGoalConstraint(
  supabase: SupabaseClient,
  goalType: string,
): Promise<GoalConstraintProposePayload | null> {
  const { data } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name, goal_detail, investment_constraints, profile_version_id")
    .eq("goal_type", goalType)
    .eq("is_active", true)
    .not("confirmed_at", "is", null)
    .maybeSingle();

  if (!data) return null;

  return {
    kind: "goal_constraint",
    goal_constraint_id: data.id,
    goal_type: data.goal_type,
    goal_display_name: data.display_name,
    profile_version_id: data.profile_version_id,
    goal_detail: data.goal_detail as Record<string, unknown>,
    investment_constraints: data.investment_constraints as GoalConstraintProposePayload["investment_constraints"],
    card_title: `请确认：${data.display_name ?? goalPickLabel(data.goal_type)}`,
  };
}

/** 对客进度摘要（不含 N/M 等内部计数） */
export function formatProfileStatusSummary(read: ProfileReadResult): string {
  const lines: string[] = [];
  if (read.eligible_groups.length > 0) {
    const names = read.eligible_groups.map((g) => g.display_name).join("、");
    lines.push(`以下需求已保存，可用于出配置方案：${names}。`);
    lines.push("回复「生成报告」可生成合并的投资需求报告。");
  }
  if (read.incomplete_groups.length > 0) {
    const names = read.incomplete_groups.map((g) => g.display_name).join("、");
    lines.push(`以下需求还差一步保存报告：${names}。`);
  }
  if (lines.length === 0) {
    return "基本情况已记下，请继续聊您的理财目标。";
  }
  return lines.join("\n");
}

/** 生成「还差哪几个场景」的提示，用于确认后 / 中段引导。 */
export function buildRemainingGoalsHint(read: ProfileReadResult): string {
  if (!read.has_basic_info) return "";

  const doneTypes = new Set<string>();
  for (const g of read.eligible_groups) doneTypes.add(g.goal_type);
  for (const g of read.incomplete_groups) doneTypes.add(g.goal_type);

  const remaining = GOAL_TYPES.filter((t) => !doneTypes.has(t));
  if (remaining.length === 0) return "";             // all done
  if (remaining.length === GOAL_TYPES.length) return ""; // none started

  const labels = remaining.map((t) => `〖${goalPickLabel(t)}〗`).join("");
  return `还差${labels}，随时告诉我。`;
}
