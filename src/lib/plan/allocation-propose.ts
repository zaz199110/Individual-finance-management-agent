import { completeText } from "@/lib/llm/invoke";
import { ensureModelSlot } from "@/lib/supabase/server";
import type { BasicInfo, InvestmentConstraints } from "@/lib/profile/types";
import type { PlanAllocationPayload } from "./types";

// ── System Prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位资深的基金投资顾问，专精于资产大类配置（股/债/货币）。

## 你的任务
根据用户的基本信息和投资约束，直接输出股票类、债券类、货币类三大类的配置比例。

## 输出格式
严格以 JSON 格式输出，不要包含任何额外的解释或 markdown：
{"stock":25,"bond":55,"cash":20,"rationale":"配置思路（2-4段白话中文）"}

## 配置原则
1. stock + bond + cash = 100%，货币类 ≥ 5%
2. 风险偏好 → 权益参考上限：保守15% 稳健30% 平衡45% 进取65%
3. 回撤容忍越小 → 权益越低；期限越短 → 权益越低
4. 目标类型：养老/教育偏稳健，财富增值可略进取
5. rationale 用对客白话解释配置思路，不写基金代码
6. rationale 中可以引用客户的一次性投入金额和每月追加金额（已提供在投资约束中），帮助客户理解配置比例。不要估算总投入金额或投资期限，因为后续环节会单独确认这些。`;

// ── Prompt Builder ───────────────────────────────────────────

function buildPrompt(input: ProposeAllocationInput): string {
  const lines: string[] = [];

  lines.push("## 投资目标");
  lines.push(`- 场景类型：${input.goal_type}`);
  lines.push(`- 场景名称：${input.goal_display_name}`);

  const bi = input.basic_info;
  if (bi) {
    lines.push("\n## 客户基本信息");
    lines.push(`- 年龄：${bi.age} 岁`);
    lines.push(`- 职业：${bi.occupation}`);
    lines.push(`- 投资经验：${bi.investment_experience}`);
    lines.push(`- 税后年收入：${bi.annual_income_after_tax.toLocaleString()} 元`);
    lines.push(`- 可投资金融资产：${bi.financial_assets.toLocaleString()} 元`);
    lines.push(`- 每月可投资：${bi.monthly_investable.toLocaleString()} 元`);
  }

  const c = input.constraints;
  lines.push("\n## 投资约束");
  lines.push(`- 风险偏好：${c.risk_tolerance}`);
  lines.push(`- 最大回撤容忍：${c.max_drawdown}`);
  lines.push(`- 目标年化收益：${c.target_return}%`);

  const raw = c as unknown as Record<string, unknown>;
  if (raw.investment_duration) lines.push(`- 投资期限：${raw.investment_duration}`);

  // 资金投入方式：一次性投入XX元，每月投入XX元，定投X月完成
  const dcaMonths = raw.dca_completion_months as string | undefined;
  const dcaStr = dcaMonths ? `，定投${dcaMonths}完成` : "";
  lines.push(`- 资金投入：一次性投入${input.principal_amount.toLocaleString()}元，每月投入${input.monthly_amount.toLocaleString()}元${dcaStr}`);

  if (input.profile_md_excerpt) {
    lines.push(`\n## 补充信息\n${input.profile_md_excerpt.slice(0, 500)}`);
  }

  return lines.join("\n") + "\n\n请输出三大类配置比例（纯 JSON）。";
}

// ── Response Parser ──────────────────────────────────────────

interface AllocationResponse {
  stock: number;
  bond: number;
  cash: number;
  rationale: string;
}

function parseAllocation(text: string): AllocationResponse | null {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  const tryParse = (s: string): AllocationResponse | null => {
    try {
      const obj = JSON.parse(s);
      const stock = Number(obj.stock);
      const bond = Number(obj.bond);
      const cash = Number(obj.cash);
      const rationale = String(obj.rationale ?? "").slice(0, 800);

      if (isNaN(stock) || isNaN(bond) || isNaN(cash)) return null;
      if (stock < 0 || bond < 0 || cash < 0) return null;

      const total = stock + bond + cash;
      if (Math.abs(total - 100) > 5) return null;

      return {
        stock: Math.round((stock / total) * 100),
        bond: Math.round((bond / total) * 100),
        cash: 100 - Math.round((stock / total) * 100) - Math.round((bond / total) * 100),
        rationale,
      };
    } catch {
      return null;
    }
  };

  const result = tryParse(cleaned);
  if (result) return result;

  // Retry by extracting outermost JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  return tryParse(match[0]);
}

// ── Amount Calculation ───────────────────────────────────────

/** 计算两个日期之间的月数，四舍五入 */
function monthDiff(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  // 平均每月 30.4375 天（365.25 / 12）
  return Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.4375));
}

/** 解析 investment_duration 文本，如 "3-5年"→60月、"12月"→12月 */
function parseDurationMonths(raw: string): number {
  // "n年" 优先（含 "3-5年" 取最后一个数字）
  const yearMatch = raw.match(/(\d+)\s*年/);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years > 0) return years * 12;
  }
  // "n月"
  const monthMatch = raw.match(/(\d+)\s*月/);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    if (months > 0) return months;
  }
  // 回退：任意数字
  const numMatch = raw.match(/(\d+)/);
  return numMatch ? Number(numMatch[1]) : 24;
}

/** 从约束中计算有效投放月数 */
function extractMonths(input: ProposeAllocationInput): number {
  const c = input.constraints as unknown as Record<string, unknown>;

  // 1. 定投完成期限字段（优先）
  const dcaMonths = c.dca_completion_months as string | undefined;
  if (dcaMonths) {
    const parsed = parseDurationMonths(dcaMonths);
    if (parsed > 0) return parsed;
  }

  // 养老/婚育/教育/置业：用资金需求日期 - 计划开始日期
  const startDate = c.start_invest_date as string | undefined;
  const endDate = c.money_needed_date as string | undefined;
  if (startDate && endDate) {
    const months = monthDiff(startDate, endDate);
    if (months > 0) return months;
  }

  // 财富增值：从 investment_duration 解析 "n年" / "n月"
  const duration = String(c.investment_duration ?? c.deploy_mode ?? "");
  if (duration) {
    return parseDurationMonths(duration);
  }

  return 24;
}

function buildPayload(
  input: ProposeAllocationInput,
  alloc: AllocationResponse,
): PlanAllocationPayload {
  const months = extractMonths(input);
  const total = input.principal_amount + input.monthly_amount * months;

  const stockAmt = Math.round((total * alloc.stock) / 100);
  const bondAmt = Math.round((total * alloc.bond) / 100);
  const cashAmt = total - stockAmt - bondAmt;

  return {
    kind: "plan_allocation",
    goal_constraint_id: input.goal_constraint_id,
    goal_display_name: input.goal_display_name,
    profile_version_id: input.profile_version_id,
    target_allocation: {
      total_amount_cny: total,
      categories: [
        { category: "股票类", allocation_pct: alloc.stock, amount_cny: stockAmt },
        { category: "债券类", allocation_pct: alloc.bond, amount_cny: bondAmt },
        { category: "货币类", allocation_pct: alloc.cash, amount_cny: cashAmt },
      ],
    },
    allocation_rationale: alloc.rationale,
    card_title: `请确认：${input.goal_display_name} · 大类配置`,
  };
}

// ── Types ────────────────────────────────────────────────────

export interface ProposeAllocationInput {
  goal_constraint_id: string;
  goal_display_name: string;
  goal_type: string;
  profile_version_id?: string;
  constraints: InvestmentConstraints;
  principal_amount: number;
  monthly_amount: number;
  basic_info?: BasicInfo;
  profile_md_excerpt?: string;
}

export interface ProposeAllocationResult {
  ok: boolean;
  payload?: PlanAllocationPayload;
  allocation_citations?: Array<{ title: string; url: string; snippet?: string }>;
  hook_failures?: string[];
  error?: string;
}

// ── Main ─────────────────────────────────────────────────────

export async function proposePlanAllocation(
  input: ProposeAllocationInput,
): Promise<ProposeAllocationResult> {
  // 1. Get model config
  let slot;
  try {
    slot = await ensureModelSlot("reasoning");
  } catch {
    return { ok: false, error: "模型配置不可用。" };
  }

  if (!slot) {
    return { ok: false, error: "reasoning 模型槽未配置。" };
  }

  const prompt = buildPrompt(input);

  const callLLM = async (temp: number): Promise<string> =>
    completeText(
      {
        api_base_url: slot.api_base_url,
        api_key: slot.api_key_encrypted,
        model_name: slot.model_name ?? "mimo-v2.5",
        provider: "mimo",
      },
      {
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        temperature: temp,
      },
    );

  // 2. First attempt
  let raw: string;
  try {
    raw = await callLLM(0.3);
  } catch (err) {
    return {
      ok: false,
      error: `大类配置 LLM 调用失败：${err instanceof Error ? err.message : "未知错误"}`,
    };
  }

  // 3. Parse & retry once on parse failure
  let parsed = parseAllocation(raw);
  if (!parsed) {
    try {
      const retryRaw = await callLLM(0.1);
      parsed = parseAllocation(retryRaw);
    } catch {
      // fall through to error
    }
  }

  if (!parsed) {
    return { ok: false, error: "LLM 未输出有效的大类配置 JSON。" };
  }

  // 4. Build result
  return {
    ok: true,
    payload: buildPayload(input, parsed),
    allocation_citations: [],
  };
}
