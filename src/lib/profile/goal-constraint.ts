import type { SupabaseClient } from "@supabase/supabase-js";
import { goalDisplayName } from "./goal-labels";
import {
  type GoalConstraintProposePayload,
  type RetirementConstraints,
  type EducationConstraints,
  type HousingConstraints,
  type MarriageChildConstraints,
  type WealthGrowthConstraints,
} from "./types";

export const GOAL_TYPES = [
  "marriage_child",
  "housing",
  "education",
  "retirement",
  "wealth_growth",
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

const PICK_LABELS: Record<string, string> = {
  marriage_child: "结婚生育",
  housing: "购房置业",
  education: "子女教育",
  retirement: "退休养老",
  wealth_growth: "财富增值",
};

export function goalPickLabel(goalType: string): string {
  return PICK_LABELS[goalType] ?? goalDisplayName(goalType);
}

const SHORT_PICK_LABELS: Record<string, string> = {
  marriage_child: "结婚生育",
  housing: "购房置业",
  education: "子女教育",
  retirement: "退休养老",
  wealth_growth: "财富增值",
};

export function goalPickShortLabel(goalType: string): string {
  return SHORT_PICK_LABELS[goalType] ?? goalPickLabel(goalType);
}

export interface GoalValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data?: GoalConstraintProposePayload;
}

export function validateGoalConstraint(raw: unknown): GoalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["goal_constraint 须为 JSON 对象。"], warnings: [] };
  }

  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "goal_constraint");
  if (kind !== "goal_constraint") {
    errors.push("kind 须为 goal_constraint。");
  }

  const goalType = String(o.goal_type ?? "");
  if (!GOAL_TYPES.includes(goalType as GoalType)) {
    errors.push(`goal_type 无效：${goalType}`);
  }

  const goalDetail = o.goal_detail;
  if (!goalDetail || typeof goalDetail !== "object") {
    errors.push("缺少 goal_detail 对象。");
  }

  const constraints = o.investment_constraints;
  if (!constraints || typeof constraints !== "object") {
    errors.push("缺少 investment_constraints 对象。");
  } else {
    const c = constraints as Record<string, unknown>;

    // capital_nature — deprecated, no longer validated or required

    for (const key of ["risk_tolerance"]) {
      if (!c[key] || typeof c[key] !== "string") {
        errors.push(`investment_constraints.${key} 必填。`);
      }
    }

    if (c.max_drawdown == null || (!Number.isFinite(Number(c.max_drawdown)) && typeof c.max_drawdown !== "string")) {
      errors.push("investment_constraints.max_drawdown 必填。");
    }

    if (c.target_return == null || !Number.isFinite(Number(c.target_return))) {
      errors.push("investment_constraints.target_return 必填且须为数字。");
    } else if (Number(c.target_return) < 0) {
      errors.push("investment_constraints.target_return 须 ≥ 0。");
    }

    const principal = Number(c.principal_amount);
    if (!Number.isFinite(principal) || principal < 0) {
      errors.push("investment_constraints.principal_amount 须 ≥ 0。");
    }

    const monthly = Number(c.monthly_amount);
    if (!Number.isFinite(monthly) || monthly < 0) {
      errors.push("investment_constraints.monthly_amount 须 ≥ 0。");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const displayName =
    typeof o.goal_display_name === "string" && o.goal_display_name.trim()
      ? o.goal_display_name.trim()
      : goalPickLabel(goalType);

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      kind: "goal_constraint",
      goal_constraint_id:
        o.goal_constraint_id != null ? String(o.goal_constraint_id) : null,
      goal_type: goalType,
      goal_display_name: displayName,
      profile_version_id:
        o.profile_version_id != null ? String(o.profile_version_id) : undefined,
      goal_detail: goalDetail as Record<string, unknown>,
      investment_constraints: constraints as GoalConstraintProposePayload["investment_constraints"],
      card_title:
        typeof o.card_title === "string"
          ? o.card_title
          : `请确认：${displayName}`,
    },
  };
}

export function formatGoalConstraintCardBody(
  payload: GoalConstraintProposePayload,
): string {
  const g = payload.goal_detail;
  const c = payload.investment_constraints as unknown as Record<string, unknown>;
  const lines: string[] = [];

  // 场景特有字段
  switch (payload.goal_type) {
    case "retirement":
      lines.push(
        `计划开始日期：${c.start_invest_date ?? "—"}`,
        `资金需求日期：${c.money_needed_date ?? "—"}`,
        `每月退休生活支出：${(c.monthly_retirement_spending as number)?.toLocaleString("zh-CN") ?? "—"} 元`,
      );
      break;
    case "education":
      lines.push(
        `计划开始日期：${c.start_invest_date ?? "—"}`,
        `资金需求日期：${c.money_needed_date ?? "—"}`,
      );
      break;
    case "housing":
      lines.push(
        `计划开始日期：${c.start_invest_date ?? "—"}`,
        `资金需求日期：${c.money_needed_date ?? "—"}`,
      );
      break;
    case "marriage_child":
      lines.push(
        `计划开始日期：${c.start_invest_date ?? "—"}`,
        `资金需求日期：${c.money_needed_date ?? "—"}`,
        `目标金额：${(c.target_amount as number)?.toLocaleString("zh-CN") ?? "—"} 元`,
      );
      break;
    case "wealth_growth":
      lines.push(
        `投资期限：${c.investment_duration ?? "—"}`,
      );
      break;
    default:
      // 兜底：展示 goal_detail 内容
      if (Object.keys(g).length > 0) {
        lines.push(JSON.stringify(g, null, 2));
      }
      break;
  }

  // 通用投资约束字段
  lines.push(
    "",
    `风险偏好：${c.risk_tolerance ?? "—"}`,
    `一次性投入：${(c.principal_amount as number)?.toLocaleString("zh-CN") ?? "—"} 元`,
    `每月投入：${(c.monthly_amount as number)?.toLocaleString("zh-CN") ?? "—"} 元`,
    `定投期限：${(c.dca_completion_months as string) ?? "—"}`,
    `目标年化收益：${c.target_return ?? "—"}%`,
    `最大回撤承受：${c.max_drawdown ?? "—"}`,
  );

  return lines.join("\n");
}

/**
 * 格式化投资目标约束为可复制的示例格式，用于用户修改时参考
 * 格式：【场景名称】key：value
 */
export function formatGoalConstraintAsCopyableExample(
  payload: GoalConstraintProposePayload,
): string {
  const c = payload.investment_constraints;
  const goalLabel = goalPickLabel(payload.goal_type);
  const lines: string[] = [`【${goalLabel}】`];

  // 场景特有字段
  switch (payload.goal_type) {
    case "retirement": {
      const rc = c as RetirementConstraints;
      lines.push(
        `计划开始日期：${rc.start_invest_date ?? ""}`,
        `资金需求日期：${rc.money_needed_date ?? ""}`,
        `每月退休生活支出：${rc.monthly_retirement_spending ?? ""}`,
      );
      break;
    }
    case "education": {
      const ec = c as EducationConstraints;
      lines.push(
        `计划开始日期：${ec.start_invest_date ?? ""}`,
        `资金需求日期：${ec.money_needed_date ?? ""}`,
      );
      break;
    }
    case "housing": {
      const hc = c as HousingConstraints;
      lines.push(
        `计划开始日期：${hc.start_invest_date ?? ""}`,
        `资金需求日期：${hc.money_needed_date ?? ""}`,
      );
      break;
    }
    case "marriage_child": {
      const mc = c as MarriageChildConstraints;
      lines.push(
        `计划开始日期：${mc.start_invest_date ?? ""}`,
        `资金需求日期：${mc.money_needed_date ?? ""}`,
        `目标金额：${mc.target_amount ?? ""}`,
      );
      break;
    }
    case "wealth_growth": {
      const wc = c as WealthGrowthConstraints;
      lines.push(
        `投资期限：${wc.investment_duration ?? ""}`,
      );
      break;
    }
  }

  // 通用投资约束字段
  lines.push(
    `风险偏好：${c.risk_tolerance ?? ""}`,
    `一次性投入：${c.principal_amount ?? ""}`,
    `每月投入：${c.monthly_amount ?? ""}`,
    `定投期限：${c.dca_completion_months ?? ""}`,
    `目标年化收益：${c.target_return ?? ""}`,
    `最大回撤承受：${c.max_drawdown ?? ""}`,
  );

  return lines.join("\n");
}

export async function getActiveGoalTypes(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("investment_goal_constraints")
    .select("goal_type")
    .eq("is_active", true);
  return new Set((data ?? []).map((r) => r.goal_type as string));
}

export async function assertGoalTypeAvailable(
  supabase: SupabaseClient,
  goalType: string,
  existingId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type")
    .eq("is_active", true)
    .eq("goal_type", goalType)
    .maybeSingle();

  if (data && data.id !== existingId) {
    return {
      ok: false,
      error: `「${goalPickLabel(goalType)}」已有活跃组（PH-PROFILE-GT-01），请走修改路径或先停用。`,
    };
  }
  return { ok: true };
}

export function loadSampleGoalPayload(
  profileVersionId?: string,
): GoalConstraintProposePayload {
  return {
    kind: "goal_constraint",
    goal_constraint_id: null,
    goal_type: "retirement",
    goal_display_name: "退休养老",
    profile_version_id: profileVersionId,
    goal_detail: {},
    investment_constraints: {
      goal_type: "retirement" as const,
      risk_tolerance: "稳健",
      max_drawdown: "约 -15%",
      target_return: 4.5,
      principal_amount: 120000,
      monthly_amount: 3000,
      dca_completion_months: "12月",
      start_invest_date: "2025-01-01",
      money_needed_date: "2040-01-01",
      monthly_retirement_spending: 8000,
    },
    card_title: "请确认：退休养老",
  };
}

// ── choice-format parsing for goal questionnaire responses ──

export interface GoalChoiceParseResult {
  ok: boolean;
  /** Parsed investment_constraints (shared Q1-Q5) */
  investment_constraints?: Record<string, unknown>;
  /** Error message if ok:false */
  error?: string;
}

type SharedQuestionSpec = {
  field: string;
  type: "categorical" | "number" | "text";
  choices?: Record<string, string>;
} & {
  special?: "principal" | "monthly";
};

const SHARED_QUESTIONS: Record<number, SharedQuestionSpec> = {
  1: {
    field: "risk_tolerance",
    type: "categorical",
    choices: { A: "保守", B: "稳健", C: "平衡", D: "进取" },
  },
  2: { field: "max_drawdown", type: "number" },
  3: { field: "target_return", type: "number" },
  4: { field: "principal_amount", type: "number", special: "principal" },
  5: { field: "monthly_amount", type: "number", special: "monthly" },
};

/** WAN-handling is omitted for percentage fields (max_drawdown, target_return). */
const NO_WAN_FIELDS = new Set(["max_drawdown", "target_return"]);

function parseNumberValue(
  text: string,
  allowWan: boolean,
): number | null {
  let cleaned = text.replace(/,/g, "").trim();
  // Strip common Chinese numeric prefixes
  cleaned = cleaned.replace(/^(约|大概|大约)\s*/, "");
  const hasWan = /万/.test(cleaned);
  if (!allowWan && hasWan) {
    // 万 is not expected but we still parse the numeric portion
  }
  const numStr = cleaned.replace(/万/g, "").trim();
  if (!numStr) return null;
  const val = parseFloat(numStr);
  if (!Number.isFinite(val)) return null;
  return allowWan && hasWan ? val * 10000 : val;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&amp;/g, "&");
}

export function parseGoalChoiceFormat(
  input: string,
  goalType: GoalType,
): GoalChoiceParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "输入为空" };
  }

  // Step 1: Extract Q/A pairs with regex
  const segmentRegex = /(\d+)[：:\s]+(.*?)(?=\s+\d+[：:\s]|$)/g;
  const matches = trimmed.matchAll(segmentRegex);

  // Step 2: Build a map of question number → answer text
  const qaMap: Map<number, string> = new Map();
  for (const match of matches) {
    const q = parseInt(match[1], 10);
    const rawAnswer = match[2].trim();
    if (!rawAnswer) continue;
    // Only keep the first occurrence (no duplicate question numbers)
    if (!qaMap.has(q)) {
      qaMap.set(q, decodeHtmlEntities(rawAnswer));
    }
  }

  // Step 3: Check required question count (5 shared questions)
  const totalQuestions = 5;
  if (qaMap.size < totalQuestions) {
    return {
      ok: false,
      error: `输入不完整：期望 ${totalQuestions} 个答案，实际找到 ${qaMap.size} 个。`,
    };
  }

  // Step 4: Parse shared questions 1-5 → investment_constraints
  const investmentConstraints: Record<string, unknown> = {};

  for (let q = 1; q <= 5; q++) {
    const spec = SHARED_QUESTIONS[q];
    const rawAnswer = qaMap.get(q);
    if (rawAnswer == null) {
      return {
        ok: false,
        error: `缺少第 ${q} 项的答案。`,
      };
    }

    if (spec.type === "categorical") {
      const letter = rawAnswer.trim().charAt(0).toUpperCase();
      if (!spec.choices || !(letter in spec.choices)) {
        return {
          ok: false,
          error: `第 ${q} 项的选项「${rawAnswer}」无效，可选：${Object.keys(spec.choices ?? {}).join("、")}`,
        };
      }
      investmentConstraints[spec.field] = spec.choices[letter];
    } else if (spec.type === "number") {
      const allowWan = !NO_WAN_FIELDS.has(spec.field);
      const val = parseNumberValue(rawAnswer, allowWan);
      if (val == null) {
        return {
          ok: false,
          error: `第 ${q} 项「${rawAnswer}」无法解析为数字。`,
        };
      }
      investmentConstraints[spec.field] = val;
    } else {
      // text fields in shared questions (currently none, but future-proof)
      investmentConstraints[spec.field] = rawAnswer.trim();
    }
  }

  return {
    ok: true,
    investment_constraints: investmentConstraints,
  };
}

export function resolveGoalTypeFromMessage(message: string): GoalType | null {
  const m = message.trim().toLowerCase();

  // 先检查是否包含【xxx】标题模式（用户粘贴的场景格式如"【退休养老】"）
  // 即使是 key-value 格式，如果标题包含目标关键词，也应该识别为目标
  const titleMatch = m.match(/【([^】]+)】/);
  if (titleMatch) {
    const title = titleMatch[1];
    if (/养老|退休|retirement/i.test(title)) return "retirement";
    if (/教育|子女|education/i.test(title)) return "education";
    if (/买房|住房|购房|housing/i.test(title)) return "housing";
    if (/婚育|结婚|生育|marriage/i.test(title)) return "marriage_child";
    if (/闲钱|增值|增长|wealth/i.test(title)) return "wealth_growth";
  }

  // 如果文本是 key-value 格式，检查是否包含投资约束特有字段
  // 如果包含，则尝试从字段值推断目标类型；否则视为基本信息
  const kvLineCount = (message.match(/[\u4e00-\u9fa5]{2,10}[：:].+/g) ?? []).length;
  if (kvLineCount >= 3) {
    // 投资约束特有字段（基本信息中不会出现）
    const GOAL_CONSTRAINT_FIELDS = /风险偏好|一次性投入|每月投入|目标年化收益|最大回撤承受/;
    if (!GOAL_CONSTRAINT_FIELDS.test(message)) return null;

    // 从字段值推断目标类型
    if (/退休|养老/.test(m)) return "retirement";
    if (/子女教育|教育金/.test(m)) return "education";
    if (/购房|买房|首付|housing/i.test(m)) return "housing";
    if (/婚育|结婚|生育/.test(m)) return "marriage_child";
    if (/闲钱|增值|增长/.test(m)) return "wealth_growth";

    // 无法从内容推断，返回 null
    return null;
  }

  if (/养老|退休|retirement|^4$/.test(m)) return "retirement";
  if (/教育|子女|education|^3$/.test(m)) return "education";
  if (/买房|住房|购房|housing|^2$/.test(m)) return "housing";
  if (/婚育|结婚|生育|marriage|^1$/.test(m)) return "marriage_child";
  if (/闲钱|增值|增长|wealth|^5$/.test(m)) return "wealth_growth";
  return null;
}

export function listGoalPickPrompt(): string {
  return GOAL_TYPES.map((t) => goalPickLabel(t)).join(" · ");
}

export function listGoalPickShortPrompt(): string {
  return GOAL_TYPES.map((t) => goalPickShortLabel(t)).join(" · ");
}

export interface GoalKeyValueParseResult {
  ok: boolean;
  data?: GoalConstraintProposePayload;
  error?: string;
  /** 缺失的字段名列表（中文），仅在校验失败时有值 */
  missingFields?: string[];
}

/**
 * 解析用户粘贴的【标题】\nkey：value 格式的场景数据
 * 示例：
 * 【退休养老】
 * 风险偏好：稳健型
 * 一次性投入：100,000 元
 * 每月投入：5,000 元
 * 目标年化收益：6%
 * 最大回撤承受：15%
 * 资金需求日期：2055-01-01
 * 每月退休生活支出：6,000 元
 */
export function parseGoalKeyValueFormat(
  input: string,
  goalType: GoalType,
  profileVersionId?: string,
): GoalKeyValueParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "输入为空" };
  }

  // 提取标题（【标题】格式是可选的，不是必须的）
  const titleMatch = trimmed.match(/【([^】]+)】/);

  // 解析 key-value 对
  const kvRegex = /([^：:\n]+)[：:]\s*(.+)/g;
  const kvMap: Record<string, string> = {};
  let match;
  while ((match = kvRegex.exec(trimmed)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) {
      kvMap[key] = value;
    }
  }

  // 构建 goal_detail
  const goalDetail: Record<string, unknown> = {};
  const investmentConstraints: Record<string, unknown> = {};

  // 1. 通用字段（所有场景共享）
  investmentConstraints.risk_tolerance = kvMap["风险偏好"] ?? kvMap["风险类型"];
  investmentConstraints.max_drawdown = kvMap["最大回撤承受"] ?? kvMap["最大回撤"];
  investmentConstraints.target_return = kvMap["目标年化收益"] ? parseFloat(kvMap["目标年化收益"]) : undefined;
  investmentConstraints.principal_amount = kvMap["一次性投入"] ? parseFloat(kvMap["一次性投入"].replace(/[,，]/g, "")) : undefined;
  investmentConstraints.monthly_amount = kvMap["每月投入"] ? parseFloat(kvMap["每月投入"].replace(/[,，]/g, "")) : undefined;
  investmentConstraints.dca_completion_months = kvMap["定投期限"] ?? undefined;

  // 2. 场景特有字段
  switch (goalType) {
    case "retirement": {
      investmentConstraints.goal_type = "retirement" as const;
      investmentConstraints.money_needed_date = kvMap["资金需求日期"] ?? kvMap["退休金领取日期"] ?? kvMap["退休日期"];
      investmentConstraints.start_invest_date = kvMap["计划开始日期"] ?? kvMap["开始投资日期"] ?? kvMap["投资起始日"];
      investmentConstraints.monthly_retirement_spending = kvMap["每月退休生活支出"] ?? kvMap["退休后月支出"]
        ? parseFloat((kvMap["每月退休生活支出"] ?? kvMap["退休后月支出"]).replace(/[,，]/g, ""))
        : undefined;
      break;
    }
    case "marriage_child": {
      investmentConstraints.goal_type = "marriage_child" as const;
      investmentConstraints.start_invest_date = kvMap["开始投资日期"] ?? kvMap["投资起始日"] ?? kvMap["计划开始日期"];
      investmentConstraints.money_needed_date = kvMap["需要用款日期"] ?? kvMap["用款日期"] ?? kvMap["资金需求日期"];
      investmentConstraints.target_amount = kvMap["目标金额"] ? parseFloat(kvMap["目标金额"].replace(/[,，]/g, "")) : undefined;
      break;
    }
    case "housing": {
      investmentConstraints.goal_type = "housing" as const;
      investmentConstraints.start_invest_date = kvMap["开始投资日期"] ?? kvMap["投资起始日"] ?? kvMap["计划开始日期"];
      investmentConstraints.money_needed_date = kvMap["需要用款日期"] ?? kvMap["用款日期"] ?? kvMap["资金需求日期"];
      break;
    }
    case "education": {
      investmentConstraints.goal_type = "education" as const;
      investmentConstraints.start_invest_date = kvMap["开始投资日期"] ?? kvMap["投资起始日"] ?? kvMap["计划开始日期"];
      investmentConstraints.money_needed_date = kvMap["需要用款日期"] ?? kvMap["用款日期"] ?? kvMap["资金需求日期"];
      break;
    }
    case "wealth_growth": {
      investmentConstraints.goal_type = "wealth_growth" as const;
      investmentConstraints.investment_duration = kvMap["投资期限"] ?? kvMap["期限"];
      break;
    }
    default: {
      // fallback: 通用解析
      investmentConstraints.goal_type = goalType;
      for (const [key, value] of Object.entries(kvMap)) {
        if (/风险偏好|风险承受|风险类型/.test(key)) continue;
        if (/最大回撤/.test(key)) continue;
        if (/目标收益|年化收益|期望收益/.test(key)) continue;
        if (/一次性投入|初始投入|本金/.test(key)) continue;
        if (/每月投入|月投入/.test(key)) continue;
        goalDetail[key] = value;
      }
    }
  }

  // 3. 校验必填字段
  const errors: string[] = [];

  // 通用必填
  if (!investmentConstraints.risk_tolerance) errors.push("风险偏好");
  if (!investmentConstraints.max_drawdown) errors.push("最大回撤承受");
  if (investmentConstraints.target_return == null || !Number.isFinite(investmentConstraints.target_return)) {
    errors.push("目标年化收益");
  }
  if (investmentConstraints.principal_amount == null || !Number.isFinite(investmentConstraints.principal_amount)) {
    errors.push("一次性投入金额");
  }
  if (investmentConstraints.monthly_amount == null || !Number.isFinite(investmentConstraints.monthly_amount)) {
    errors.push("每月投入金额");
  }

  // 场景特有必填
  switch (goalType) {
    case "retirement":
      if (!investmentConstraints.start_invest_date) errors.push("计划开始日期");
      if (!investmentConstraints.money_needed_date) errors.push("资金需求日期");
      if (investmentConstraints.monthly_retirement_spending == null || !Number.isFinite(investmentConstraints.monthly_retirement_spending)) {
        errors.push("每月退休生活支出");
      }
      break;
    case "marriage_child":
      if (!investmentConstraints.start_invest_date) errors.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) errors.push("需要用款日期");
      if (investmentConstraints.target_amount == null || !Number.isFinite(investmentConstraints.target_amount)) {
        errors.push("目标金额");
      }
      break;
    case "housing":
      if (!investmentConstraints.start_invest_date) errors.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) errors.push("需要用款日期");
      break;
    case "education":
      if (!investmentConstraints.start_invest_date) errors.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) errors.push("需要用款日期");
      break;
    case "wealth_growth":
      if (!investmentConstraints.investment_duration) errors.push("投资期限");
      break;
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: `解析失败：${errors.map((e) => `缺少${e}`).join("；")}`,
      missingFields: errors,
    };
  }

  // 收集缺失字段（值为 undefined 或空的字段）
  const missingFields: string[] = [];

  // 通用字段检查
  if (!investmentConstraints.risk_tolerance) missingFields.push("风险偏好");
  if (!investmentConstraints.max_drawdown) missingFields.push("最大回撤承受");
  if (investmentConstraints.target_return == null || !Number.isFinite(investmentConstraints.target_return)) {
    missingFields.push("目标年化收益");
  }
  if (investmentConstraints.principal_amount == null || !Number.isFinite(investmentConstraints.principal_amount)) {
    missingFields.push("一次性投入金额");
  }
  if (investmentConstraints.monthly_amount == null || !Number.isFinite(investmentConstraints.monthly_amount)) {
    missingFields.push("每月投入金额");
  }

  // 场景特有字段检查
  switch (goalType) {
    case "retirement":
      if (!investmentConstraints.start_invest_date) missingFields.push("计划开始日期");
      if (!investmentConstraints.money_needed_date) missingFields.push("资金需求日期");
      if (investmentConstraints.monthly_retirement_spending == null || !Number.isFinite(investmentConstraints.monthly_retirement_spending)) {
        missingFields.push("每月退休生活支出");
      }
      break;
    case "marriage_child":
      if (!investmentConstraints.start_invest_date) missingFields.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) missingFields.push("需要用款日期");
      if (investmentConstraints.target_amount == null || !Number.isFinite(investmentConstraints.target_amount)) {
        missingFields.push("目标金额");
      }
      break;
    case "housing":
      if (!investmentConstraints.start_invest_date) missingFields.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) missingFields.push("需要用款日期");
      break;
    case "education":
      if (!investmentConstraints.start_invest_date) missingFields.push("开始投资日期");
      if (!investmentConstraints.money_needed_date) missingFields.push("需要用款日期");
      break;
    // wealth_growth 没有额外必填字段
  }

  const displayName = goalPickLabel(goalType);

  return {
    ok: true,
    data: {
      kind: "goal_constraint",
      goal_constraint_id: null,
      goal_type: goalType,
      goal_display_name: displayName,
      profile_version_id: profileVersionId,
      goal_detail: goalDetail,
      investment_constraints: investmentConstraints as unknown as GoalConstraintProposePayload["investment_constraints"],
      card_title: `请确认：${displayName}`,
    },
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}
