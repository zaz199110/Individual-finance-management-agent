import { completeText } from "@/lib/llm/invoke";
import { ensureModelSlot } from "@/lib/supabase/server";
import { FUND_L0_REGISTRY } from "@/harness/infra/fund_knowledge/l0-registry";
import type { PlanDetailCategory, PlanFundItem } from "./plan-report-blueprint";
import type { PlanAllocationPayload, PlanDetailPayload } from "./types";

// ── L0 Candidate Types ──────────────────────────────────────

export interface L0Candidate {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  is_qdii: boolean;
}

// ── Lightweight Categorization ──────────────────────────────

function buildL0Candidates(allowQdii: boolean): Record<string, L0Candidate[]> {
  const result: Record<string, L0Candidate[]> = {
    "股票类": [],
    "债券类": [],
    "货币类": [],
  };

  for (const profile of Object.values(FUND_L0_REGISTRY)) {
    const t = profile.fund_type.toLowerCase();
    // Skip commodity funds (gold, commodities, precious metals)
    if (/商品|黄金|原油/.test(t)) continue;
    // Skip QDII if not allowed
    if (!allowQdii && profile.is_qdii) continue;

    const candidate: L0Candidate = {
      fund_code: profile.fund_code,
      fund_name: profile.fund_name,
      fund_type: profile.fund_type,
      is_qdii: profile.is_qdii ?? false,
    };

    if (/货币/.test(t)) {
      result["货币类"].push(candidate);
    } else if (/债/.test(t) || /同业存单|固收/.test(t)) {
      result["债券类"].push(candidate);
    } else if (/股票|指数|qdii|混合|偏股|宽基|行业|海外/.test(t)) {
      result["股票类"].push(candidate);
    }
    // else: silently skip unrecognized types
  }

  return result;
}

// ── System Prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `你是基金投资顾问，专精基金筛选和组合构建。

## 任务
根据大类配置比例和基金池，各选1-3只基金输出组合方案。

## 输出格式
严格JSON，无额外解释或markdown：
{
  "categories": [
    {
      "category": "股票类",
      "structure_note": "配置思路（可选）",
      "items": [
        {
          "fund_code": "000001",
          "fund_name": "某某基金",
          "weight_in_category": 60,
          "recommendation_reason": "推荐理由（1-2句白话）",
          "role_label": "宽基"
        }
      ]
    }
  ]
}

## 选基原则
1. 每类选1-3只，同类内weight加总为100
2. 优先境内基金（非QDII），除非池内仅有QDII
3. 股票类：宽基打底，行业卫星少量；债券类：信用债底仓；货币类：选1只
4. recommendation_reason用白话，避免内部术语，不写基金代码
5. fund_code和fund_name必须从基金池精确复制

## 约束
- 总数3-6只（保守/稳健可2-3只，平衡/进取可7-8只）
- 单只≤40%（货币类豁免）
- 尽量2家以上不同基金公司
- 突破约束时在structure_note说明`;

// ── Prompt Builder ───────────────────────────────────────────

function buildPrompt(
  input: ProposeDetailInput,
  l0Candidates: Record<string, L0Candidate[]>,
): string {
  const lines: string[] = [];

  // If there are excluded funds, add a special section at the top
  if (input.excludeFundCodes && input.excludeFundCodes.length > 0) {
    lines.push("## ⚠️ 重要：用户不满意的基金（必须排除）");
    lines.push("以下基金是用户明确表示不满意的，**绝对不能**出现在推荐结果中：");
    for (const code of input.excludeFundCodes) {
      const fund = FUND_L0_REGISTRY[code];
      lines.push(`- ${code}${fund ? ` ${fund.fund_name}` : ""}`);
    }
    if (input.dissatisfactionReason) {
      lines.push(`\n用户不满意的原因：${input.dissatisfactionReason}`);
      lines.push("请根据此原因，在推荐时**避免选择有类似问题的基金**，并**优先选择能解决此问题的基金**。");
    }
    lines.push("");
  }

  lines.push("## 大类配置（来自第一步）");
  let totalCny = 0;
  for (const c of input.target_allocation.categories) {
    const amt = c.amount_cny ?? 0;
    lines.push(`- ${c.category}：${c.allocation_pct}%（约${amt.toLocaleString()}元）`);
    totalCny += amt;
  }
  lines.push(`- 总投资金额：约${totalCny.toLocaleString()}元`);

  // Fund pool — L0 registry direct, no scoring/Tushare
  // Filter out excluded funds from the candidate pool
  const excludeSet = new Set(input.excludeFundCodes ?? []);
  lines.push("\n## 可选基金池");
  for (const [cat, funds] of Object.entries(l0Candidates)) {
    const available = funds.filter(f => !excludeSet.has(f.fund_code));
    if (!available.length) continue;
    lines.push(`\n### ${cat}（共${available.length}只候选）`);
    for (const f of available) {
      const qdii = f.is_qdii ? " [QDII]" : "";
      lines.push(`- ${f.fund_code} | ${f.fund_name} | ${f.fund_type}${qdii}`);
    }
  }

  lines.push("\n## 客户背景");
  lines.push(`- 场景名称：${input.goal_display_name}`);
  lines.push(`- 场景类型：${input.goal_type ?? "未指定"}`);
  const c = input.constraints;
  lines.push(`- 风险偏好：${c.risk_tolerance}`);
  lines.push(`- 最大回撤容忍：${c.max_drawdown}`);
  lines.push(`- 目标年化收益：${c.target_return}%`);
  const raw = c as unknown as Record<string, unknown>;
  if (raw.investment_duration) lines.push(`- 投资期限：${raw.investment_duration}`);
  if (raw.deploy_mode) lines.push(`- 投入方式：${raw.deploy_mode}`);
  lines.push(`- 已有本金：${input.principal_amount.toLocaleString()}元`);
  lines.push(`- 每月追加：${input.monthly_amount.toLocaleString()}元`);

  lines.push("\n## 组合约束（软约束 · 场景优先）");
  lines.push(`- 总基金数：建议3-6只（当前共${l0Candidates["股票类"].length + l0Candidates["债券类"].length + l0Candidates["货币类"].length}只候选），${c.risk_tolerance === "保守" || c.risk_tolerance === "稳健" ? "保守/稳健偏好可少选至2-3只" : "可适当增至7-8只"}`);
  lines.push(`- 单只上限：不超过组合的40%（货币类豁免）`);
  lines.push("- 公司分散：尽量2家以上不同基金公司");
  lines.push("- 角色分散：股票类内 role_label 避免全宽基或全行业");
  lines.push("- 以上均为软约束，与场景冲突时以场景为准，突破需在 structure_note 中说明");

  lines.push("\n## 要求");
  lines.push("- 股票类选1-3只、债券类选1-3只、货币类选1只");
  lines.push("- 每个大类内 weight_in_category 加总必须等于100");
  lines.push("- fund_code 和 fund_name 必须从上述基金池中精确复制");
  lines.push("- 优先选非QDII境内基金，除非该大类只有QDII可选");
  if (input.excludeFundCodes && input.excludeFundCodes.length > 0) {
    lines.push(`- **绝对不能**选择以下基金代码：${input.excludeFundCodes.join("、")}`);
  }

  return lines.join("\n") + "\n\n请输出基金选择方案（纯 JSON）。";
}

// ── Response Parser ──────────────────────────────────────────

export interface DetailCategoryOutput {
  category: string;
  structure_note?: string;
  items: Array<{
    fund_code: string;
    fund_name: string;
    weight_in_category: number;
    recommendation_reason: string;
    role_label?: string;
  }>;
}

export interface DetailResponse {
  categories: DetailCategoryOutput[];
}

function parseDetail(text: string): DetailResponse | null {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  const tryParse = (s: string): DetailResponse | null => {
    try {
      const obj = JSON.parse(s);
      if (!obj.categories || !Array.isArray(obj.categories)) return null;
      if (obj.categories.length === 0) return null;
      for (const cat of obj.categories) {
        if (
          typeof cat.category !== "string" ||
          !Array.isArray(cat.items) ||
          cat.items.length === 0
        ) return null;
        for (const item of cat.items) {
          if (
            typeof item.fund_code !== "string" ||
            typeof item.fund_name !== "string" ||
            item.weight_in_category == null ||
            isNaN(Number(item.weight_in_category))
          ) return null;
        }
      }
      return obj as DetailResponse;
    } catch {
      return null;
    }
  };

  let result = tryParse(cleaned);
  if (result) return result;

  // Retry by extracting outermost JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return tryParse(match[0]);
}

// ── Soft-Constraint Post-Validation ──────────────────────────

/** Extract fund company from fund_name (e.g. "易方达沪深300ETF联接A" → "易方达") */
function extractCompany(fundName: string): string {
  const knownCompanies = [
    "易方达", "华夏", "天弘", "中欧", "博时", "广发", "招商",
    "南方", "富国", "嘉实", "工银瑞信", "建信", "鹏华", "汇添富",
    "景顺长城", "华安", "国泰", "银华", "万家", "安信", "交银施罗德",
    "兴证全球", "东方红", "大成", "华泰柏瑞",
  ];
  // Try known 4-char companies first, then 3-char, then 2-char
  for (const co of knownCompanies) {
    if (fundName.startsWith(co)) return co;
  }
  // Fallback: take first 2-4 chars
  return fundName.slice(0, Math.min(fundName.length, 4));
}

export interface SoftCheckWarning {
  rule: string;
  level: "warn" | "info";
  detail: string;
  exempt_reason?: string;
}

export function softCheckDetail(
  parsed: DetailResponse,
  l0Map: Map<string, L0Candidate>,
  constraints: import("@/lib/profile/types").InvestmentConstraints,
): SoftCheckWarning[] {
  const warnings: SoftCheckWarning[] = [];
  const allItems = parsed.categories.flatMap((c) =>
    c.items.map((i) => ({ ...i, category: c.category })),
  );
  const totalAlloc = allItems.reduce((s, i) => s + Number(i.weight_in_category || 0), 0);

  // Rule 1: Fund count
  const fundCount = allItems.length;
  if (fundCount < 2) {
    warnings.push({
      rule: "数量下限",
      level: "warn",
      detail: `仅推荐${fundCount}只基金，低于建议下限2只`,
    });
  } else if (fundCount > 8) {
    warnings.push({
      rule: "数量上限",
      level: "warn",
      detail: `推荐${fundCount}只基金，超过建议上限8只`,
    });
  } else if (fundCount < 3) {
    warnings.push({
      rule: "数量偏少",
      level: "info",
      detail: `推荐${fundCount}只基金，略低于建议的3-6只区间`,
    });
  } else if (fundCount > 6) {
    warnings.push({
      rule: "数量偏多",
      level: "info",
      detail: `推荐${fundCount}只基金，略超建议的3-6只区间`,
    });
  }

  // Rule 2: Single fund concentration (within portfolio)
  if (totalAlloc > 0) {
    for (const item of allItems) {
      const pct = (Number(item.weight_in_category) / totalAlloc) * 100;
      if (pct > 40 && item.category !== "货币类") {
        warnings.push({
          rule: "集中度",
          level: "warn",
          detail: `"${item.fund_name}"占组合约${pct.toFixed(0)}%，超过40%上限（货币类豁免）`,
        });
      }
    }
  }

  // Rule 3: Company diversity
  const companies = new Set(allItems.map((i) => extractCompany(i.fund_name)));
  if (companies.size < 2) {
    warnings.push({
      rule: "公司分散",
      level: "warn",
      detail: `全部${fundCount}只基金来自同一家公司（${[...companies][0]}），建议至少2家`,
    });
  }

  // Rule 4: Role diversity within equity category
  const stockCat = parsed.categories.find((c) => c.category === "股票类");
  if (stockCat && stockCat.items.length >= 2) {
    const roleCounts = new Map<string, number>();
    for (const item of stockCat.items) {
      const role = String(item.role_label ?? "").trim();
      if (role) roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    }
    for (const [role, count] of roleCounts) {
      if (count >= 3) {
        warnings.push({
          rule: "角色分散",
          level: "warn",
          detail: `股票类中"${role}"角色出现${count}次，过于集中`,
        });
      } else if (count >= 2 && roleCounts.size === 1) {
        warnings.push({
          rule: "角色分散",
          level: "info",
          detail: `股票类全部${stockCat.items.length}只均为"${role}"，缺少角色差异`,
        });
      }
    }
  }

  return warnings;
}

export interface ProposeDetailInput {
  goal_constraint_id: string;
  goal_display_name: string;
  goal_type?: string;
  profile_version_id?: string;
  constraints: import("@/lib/profile/types").InvestmentConstraints;
  principal_amount: number;
  monthly_amount: number;
  target_allocation: PlanAllocationPayload["target_allocation"];
  allow_qdii?: boolean;
  /** 基金代码列表，重新选基时排除这些基金（用户不满意的基金） */
  excludeFundCodes?: string[];
  /** 用户对不满意基金的原因说明，传递给LLM帮助更精准选基 */
  dissatisfactionReason?: string;
}

export interface ProposeDetailResult {
  ok: boolean;
  payload?: PlanDetailPayload;
  soft_warnings?: SoftCheckWarning[];
  hook_failures?: string[];
  error?: string;
}

// ── Main ─────────────────────────────────────────────────────

export async function proposePlanDetail(
  input: ProposeDetailInput,
): Promise<ProposeDetailResult> {
  // 1. Build L0 candidate pool directly from registry (no Tushare/scoring)
  const l0Candidates = buildL0Candidates(input.allow_qdii !== false);

  // Build a lookup map for fund validation
  const l0Map = new Map<string, L0Candidate>();
  for (const funds of Object.values(l0Candidates)) {
    for (const f of funds) {
      l0Map.set(f.fund_code, f);
    }
  }

  // 2. Get model config
  let slot;
  try {
    slot = await ensureModelSlot("reasoning");
  } catch {
    return { ok: false, error: "模型配置不可用。" };
  }
  if (!slot) {
    return { ok: false, error: "reasoning 模型槽未配置。" };
  }

  const prompt = buildPrompt(input, l0Candidates);

  // 3. Single call, no retry — temperature=0 for deterministic output
  let raw: string;
  try {
    raw = await completeText(
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
        temperature: 0,
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `基金明细 LLM 调用失败：${err instanceof Error ? err.message : "未知错误"}`,
    };
  }

  const parsed = parseDetail(raw);
  if (!parsed) {
    return { ok: false, error: "LLM 未输出有效的基金明细 JSON。" };
  }

  // 5. Validate funds against screened pool
  for (const cat of parsed.categories) {
    for (const item of cat.items) {
      if (!l0Map.has(item.fund_code)) {
        return {
          ok: false,
          error: `LLM 输出了不在基金池中的基金：${item.fund_code} ${item.fund_name}`,
        };
      }
    }
  }

  // 5b. Soft-constraint post-check (non-blocking, annotate only)
  const softWarnings = softCheckDetail(parsed, l0Map, input.constraints);
  if (softWarnings.length > 0) {
    const warnMsgs = softWarnings
      .map((w) => `[${w.level.toUpperCase()}] ${w.rule}: ${w.detail}`)
      .join("; ");
    console.warn(`[detail-propose] 软约束警告 (${softWarnings.length}条): ${warnMsgs}`);
  }

  // 6. Build PlanDetailCategory[] with computed allocation_pct_of_portfolio
  const targetAllocMap = new Map<string, number>();
  for (const c of input.target_allocation.categories) {
    targetAllocMap.set(c.category, c.allocation_pct);
  }

  const categories: PlanDetailCategory[] = [];
  for (const cat of parsed.categories) {
    const catPct = targetAllocMap.get(cat.category) ?? 0;

    // Normalize weights within category to sum to 100
    const rawWeightSum = cat.items.reduce((s, i) => s + Number(i.weight_in_category), 0);
    const scale = rawWeightSum > 0 ? 100 / rawWeightSum : 100 / cat.items.length;

    const items: PlanFundItem[] = cat.items.map((item) => {
      const normalizedWeight = Math.round(Number(item.weight_in_category) * scale);
      const portfolioPct = Math.round((catPct * normalizedWeight) / 100);
      return {
        fund_code: item.fund_code,
        fund_name: item.fund_name,
        weight_in_category: normalizedWeight,
        allocation_pct_of_portfolio: portfolioPct,
        recommendation_reason: String(item.recommendation_reason ?? "").slice(0, 300),
        role_label: String(item.role_label ?? "").slice(0, 20),
      };
    });

    // Fix rounding: ensure allocation_pct_of_portfolio sum matches catPct
    const portfolioSum = items.reduce((s, i) => s + i.allocation_pct_of_portfolio, 0);
    const diff = catPct - portfolioSum;
    if (items.length > 0 && diff !== 0) {
      items[0]!.allocation_pct_of_portfolio += diff;
    }

    categories.push({
      category: cat.category,
      allocation_pct: catPct,
      items,
      structure_note: cat.structure_note?.slice(0, 200),
    });
  }

  // 7. Build summary
  const summary: Record<string, number> = {};
  for (const c of input.target_allocation.categories) {
    summary[c.category] = c.allocation_pct;
  }

  // 8. Build payload
  const payload: PlanDetailPayload = {
    kind: "plan_detail",
    goal_constraint_id: input.goal_constraint_id,
    goal_display_name: input.goal_display_name,
    profile_version_id: input.profile_version_id,
    target_allocation_summary: summary,
    detailed_plan: { categories },
    web_citations: [],
    card_title: `请确认：${input.goal_display_name} · 基金明细`,
  };

  return { ok: true, payload, soft_warnings: softWarnings };
}
