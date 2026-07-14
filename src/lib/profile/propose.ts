import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatBasicInfoCardBody,
  validateBasicInfo,
} from "./basic-info";
import {
  assertGoalTypeAvailable,
  formatGoalConstraintCardBody,
  validateGoalConstraint,
} from "./goal-constraint";
import { createProposeArtifact } from "./artifacts";
import type {
  ConfirmCardBlock,
  GoalConstraintProposePayload,
  ProfileBasicProposePayload,
} from "./types";

export interface ProfileProposeResult {
  ok: boolean;
  artifact_id?: string;
  summary_zh?: string;
  card?: ConfirmCardBlock;
  preview?: string;
  error?: string;
  warnings?: string[];
}

export async function profileProposeBasic(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    payload: ProfileBasicProposePayload;
  },
): Promise<ProfileProposeResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接，无法创建确认卡。" };
  }

  const validation = validateBasicInfo(params.payload.basic_info);
  if (!validation.ok || !validation.data) {
    return {
      ok: false,
      error: validation.errors.join(" "),
      warnings: validation.warnings,
    };
  }

  const info = validation.data;
  const summary = `${info.name}，${info.age} 岁 · 税后年收入约 ${info.annual_income_after_tax.toLocaleString("zh-CN")} 元`;

  const fullPayload: ProfileBasicProposePayload = {
    kind: "profile_basic",
    card_title: params.payload.card_title ?? "请确认：基本情况",
    basic_info: info,
    formula_hint: params.payload.formula_hint,
  };

  const artifact = await createProposeArtifact(supabase, {
    conversationId: params.conversationId,
    runId: params.runId,
    kind: "profile_basic",
    summaryZh: summary,
    payload: fullPayload as unknown as Record<string, unknown>,
  });

  const card: ConfirmCardBlock = {
    type: "confirm_card",
    status: "active",
    artifact_id: artifact.id,
    card_kind: "profile_basic",
    summary_zh: summary,
    card_title: fullPayload.card_title,
  };

  const preview = formatBasicInfoCardBody(info, params.payload.formula_hint);

  return {
    ok: true,
    artifact_id: artifact.id,
    summary_zh: summary,
    card,
    preview,
    warnings: validation.warnings,
  };
}

export async function profileProposeGoalConstraint(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    payload: GoalConstraintProposePayload;
  },
): Promise<ProfileProposeResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接，无法创建确认卡。" };
  }

  const validation = validateGoalConstraint(params.payload);
  if (!validation.ok || !validation.data) {
    return {
      ok: false,
      error: validation.errors.join(" "),
      warnings: validation.warnings,
    };
  }

  let profileVersionId = validation.data.profile_version_id;
  if (!profileVersionId) {
    const { data: current } = await supabase
      .from("profile_versions")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();
    if (!current?.id) {
      return { ok: false, error: "请先确认并保存基本情况。" };
    }
    profileVersionId = current.id as string;
  }

  const typeCheck = await assertGoalTypeAvailable(
    supabase,
    validation.data.goal_type,
    validation.data.goal_constraint_id,
  );
  if (!typeCheck.ok) {
    return { ok: false, error: typeCheck.error };
  }

  const data: GoalConstraintProposePayload = {
    ...validation.data,
    profile_version_id: profileVersionId,
  };

  const constraints = data.investment_constraints as unknown as Record<string, unknown>;
  const summary = `${data.goal_display_name ?? data.goal_type} · 已有 ${Number(constraints.principal_amount).toLocaleString("zh-CN")} 元 · 月投 ${Number(constraints.monthly_amount).toLocaleString("zh-CN")} 元`;

  const artifact = await createProposeArtifact(supabase, {
    conversationId: params.conversationId,
    runId: params.runId,
    kind: "goal_constraint",
    summaryZh: summary,
    payload: data as unknown as Record<string, unknown>,
  });

  const card: ConfirmCardBlock = {
    type: "confirm_card",
    status: "active",
    artifact_id: artifact.id,
    card_kind: "goal_constraint",
    summary_zh: summary,
    card_title: data.card_title,
  };

  return {
    ok: true,
    artifact_id: artifact.id,
    summary_zh: summary,
    card,
    preview: formatGoalConstraintCardBody(data),
    warnings: validation.warnings,
  };
}

export function loadSampleBasicPayload(): ProfileBasicProposePayload {
  return {
    kind: "profile_basic",
    card_title: "请确认：基本情况",
    basic_info: {
      name: "张先生",
      age: 35,
      gender: "",
      marital_status: "已婚，一个 8 岁的儿子",
      has_children: "",
      occupation: "国企职员，收入较稳定",
      investment_experience: "",
      annual_income_after_tax: 280000,
      monthly_income_after_tax: 18000,
      financial_assets: 500000,
      loan_balance_total: 1200000,
      monthly_loan_payment: 6500,
      monthly_fixed_expense: 8000,
      monthly_investable: 3500,
    },
    formula_hint: "18,000 − 8,000 − 6,500 = 3,500",
  };
}
