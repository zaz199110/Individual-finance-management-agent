import { executeTool } from "@/harness/tools/router";
import { writeStage } from "@/harness/tasks/stage";
import { streamTextViaSse } from "@/harness/stream/sse-stream";
import type {
  ContentBlock,
  ExecutionPlan,
  QueryState,
  SseWriter,
} from "@/harness/types";
import { getSupabase } from "@/lib/supabase/server";
import { buildPlanAllocationFormal } from "@/lib/plan/allocation-builder";
import { buildPlanDetailFormal, buildPlanDetailWithWeb } from "@/lib/plan/detail-builder";
import { buildPlanBlockedReply } from "@/lib/plan/placeholder";
import { planRead } from "@/lib/plan/read";
import { profileRead } from "@/lib/profile/read";
import { resolveGoalTypeFromMessage } from "@/lib/profile/goal-constraint";
import { GOAL_TYPE_LABELS } from "@/lib/profile/goal-labels";
import type { ConfirmCardBlock, ReportPublishCardBlock } from "@/lib/profile/types";
import type { PlanAllocationPayload, PlanDetailPayload, PlanDetailCategory } from "@/lib/plan/types";
import { FUND_L0_REGISTRY } from "@/harness/infra/fund_knowledge/l0-registry";
import { completeText } from "@/lib/llm/invoke";
import { ensureModelSlot } from "@/lib/supabase/server";
import { proposePlanDetail } from "@/lib/plan/detail-propose";

const PLAN_START_HINT = "先说「生成大类」确认配置比例，再说「生成明细」选基金，最后「生成规划书」。";

async function finishPlanReply(
  sse: SseWriter,
  assistantContent: string,
  contentBlocks: ContentBlock[],
): Promise<{ assistantContent: string; contentBlocks: ContentBlock[] }> {
  await streamTextViaSse(sse, assistantContent);
  if (!contentBlocks.some((b) => b.type === "text")) {
    contentBlocks.unshift({ type: "text", text: assistantContent });
  }
  return { assistantContent, contentBlocks };
}

async function emitProposeTool(
  state: QueryState,
  sse: SseWriter,
  input: Record<string, unknown>,
  contentBlocks: ContentBlock[],
): Promise<{ ok: boolean; assistantExtra: string }> {
  const tool = await executeTool({
    tool: "plan_propose",
    input,
    scene: "plan",
    conversationId: state.conversationId,
    runId: state.runId,
  });
  if (tool.ok && tool.data && typeof tool.data === "object") {
    const data = tool.data as { card?: ConfirmCardBlock; preview?: string };
    if (data.card) {
      contentBlocks.push(data.card);
      sse.write("content_block", data.card);
    }
    return {
      ok: true,
      assistantExtra: "\n\n" + (data.preview ?? tool.preview),
    };
  }
  return { ok: false, assistantExtra: tool.error ?? "生成确认卡失败。" };
}

/** Find an eligible group whose display_name appears in the user message */
function findSceneByName(
  message: string,
  groups: Array<{ display_name: string; goal_constraint_id: string; goal_type?: string }>,
): { display_name: string; goal_constraint_id: string } | null {
  // 1. Exact match on display_name (e.g. "财富增值" in message)
  for (const g of groups) {
    if (message.includes(g.display_name)) {
      return g;
    }
  }
  // 2. Fuzzy match via goal type resolver (e.g. "财富增长" → wealth_growth → "财富增值")
  const resolvedGoalType = resolveGoalTypeFromMessage(message);
  if (resolvedGoalType) {
    const label = GOAL_TYPE_LABELS[resolvedGoalType];
    if (label) {
      const match = groups.find((g) => g.display_name === label || g.goal_type === resolvedGoalType);
      if (match) return match;
    }
  }
  return null;
}

/** Try to extract a scene name from user message when no eligible group matched */
function extractMentionedSceneName(message: string): string | null {
  const patterns = [
    /针对(.+?)(?:场景|的|做|出|生成|方案)/,
    /给(.+?)(?:做|出|生成|方案)/,
    /为(.+?)(?:做|出|生成|配置|方案)/,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length >= 2 && !/^(了|的|着|过|这个|那个)$/.test(name)) {
        return name;
      }
    }
  }
  return null;
}

// ── Fund Replacement Helpers ──────────────────────────────────

/** Match patterns: 对XXX不满意, 换掉XXX, 替换XXX, 请换一只XXX, 不喜欢XXX, 换一只XXX */
const FUND_REPLACEMENT_PATTERNS = [
  /(?:对|觉得)\s*(\d{6})\s*(?:不满意|不好|不喜欢|不合适|不想要|不想|不好看)/,
  /(?:换掉|更换|替换|换走|去掉|淘汰)\s*(\d{6})/,
  /(?:请\s*)?(?:换一?只|替一?只)\s*(?:新的\s*)?(\d{6})/,
  /(\d{6})\s*(?:不满意|不好|不喜欢|不合适|不想要|不想|不好看)/,
  /(\d{6})\s*(?:换掉|更换|替换|换走|去掉)/,
  /(?:请\s*)?换掉\s*(\d{6})/,
  /(?:请\s*)?替换\s*(\d{6})/,
];

/**
 * Try to extract a 6-digit fund code from a fund replacement intent message.
 * Returns the fund code if found, null otherwise.
 */
function extractFundReplacementCode(message: string): string | null {
  // First check if the message has any replacement intent keywords
  const hasIntent =
    /不满意|换掉|更换|替换|换走|去掉|淘汰|不喜欢|不合适|不想要|不想|不好看|换一?只|替一?只/.test(
      message,
    );
  if (!hasIntent) return null;

  for (const pattern of FUND_REPLACEMENT_PATTERNS) {
    const m = message.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Result of finding a fund in the current plan detail */
interface FundLocation {
  fundCode: string;
  fundName: string;
  categoryName: string;
  categoryIndex: number;
  itemIndex: number;
  /** Deep-cloned categories array (mutatable) */
  categories: PlanDetailCategory[];
  /** The goal_constraint_id from the payload */
  goalConstraintId: string;
  goalDisplayName?: string;
}

/**
 * Read the current (is_current=true) step-2 plan from DB and search for the fund.
 * Returns the deep-cloned categories plus location metadata, or null if not found.
 */
async function findFundInCurrentPlan(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  goalId: string,
  fundCode: string,
): Promise<FundLocation | null> {
  if (!supabase) return null;
  const { data: plan } = await supabase
    .from("allocation_plans")
    .select("detailed_plan, goal_constraint_id")
    .eq("goal_constraint_id", goalId)
    .eq("plan_step", 2)
    .eq("is_current", true)
    .maybeSingle();

  if (!plan?.detailed_plan) return null;

  const dp = plan.detailed_plan as {
    categories?: Array<{
      category: string;
      allocation_pct: number;
      items: Array<{
        fund_code: string;
        fund_name: string;
        weight_in_category?: number;
        allocation_pct_of_portfolio: number;
        recommendation_reason?: string;
        role_label?: string;
      }>;
      structure_note?: string;
    }>;
  };

  if (!dp.categories || !Array.isArray(dp.categories)) return null;

  // Deep clone so we can mutate
  const categories: PlanDetailCategory[] = JSON.parse(JSON.stringify(dp.categories));

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci]!;
    for (let ii = 0; ii < cat.items.length; ii++) {
      if (cat.items[ii]!.fund_code === fundCode) {
        return {
          fundCode,
          fundName: cat.items[ii]!.fund_name,
          categoryName: cat.category,
          categoryIndex: ci,
          itemIndex: ii,
          categories,
          goalConstraintId: plan.goal_constraint_id ?? goalId,
          goalDisplayName: undefined,
        };
      }
    }
  }
  return null;
}

/** Build L0 candidates for a given category (reuses detail-propose logic inline) */
function buildCandidatesForCategory(categoryName: string): Array<{
  fund_code: string;
  fund_name: string;
  fund_type: string;
  is_qdii: boolean;
}> {
  const result: Array<{
    fund_code: string;
    fund_name: string;
    fund_type: string;
    is_qdii: boolean;
  }> = [];

  for (const profile of Object.values(FUND_L0_REGISTRY)) {
    const t = profile.fund_type.toLowerCase();
    // Skip commodity funds
    if (/商品|黄金|原油/.test(t)) continue;

    const matchesCategory =
      (categoryName === "股票类" && /股票|指数|qdii|混合|偏股|宽基|行业|海外/.test(t)) ||
      (categoryName === "债券类" && (/债/.test(t) || /同业存单|固收/.test(t))) ||
      (categoryName === "货币类" && /货币/.test(t));

    if (matchesCategory) {
      result.push({
        fund_code: profile.fund_code,
        fund_name: profile.fund_name,
        fund_type: profile.fund_type,
        is_qdii: profile.is_qdii ?? false,
      });
    }
  }
  return result;
}

/** Build the LLM prompt for single-fund replacement */
function buildReplacePrompt(
  categoryName: string,
  existingCodes: Set<string>,
  replacedCode: string,
  replacedName: string,
  categoryPct: number,
): string {
  const allCandidates = buildCandidatesForCategory(categoryName);

  // Filter out the fund being replaced and any other funds already in the category
  const available = allCandidates.filter(
    (c) => c.fund_code !== replacedCode && !existingCodes.has(c.fund_code),
  );

  if (available.length === 0) {
    return ""; // signal: no candidates
  }

  const lines: string[] = [];
  lines.push(`## 任务`);
  lines.push(
    `用户对当前方案中的基金 ${replacedCode} ${replacedName} 不满意，要求在「${categoryName}」中推荐一只替代基金。`,
  );
  lines.push(`该大类占组合 ${categoryPct}%。`);
  lines.push("");

  lines.push("## 已选入组合的基金（不可再选）");
  for (const code of existingCodes) {
    lines.push(`- ${code}`);
  }
  lines.push("");

  lines.push(`## 可选基金池（${categoryName}，共${available.length}只候选）`);
  for (const f of available) {
    const qdii = f.is_qdii ? " [QDII]" : "";
    lines.push(`- ${f.fund_code} | ${f.fund_name} | ${f.fund_type}${qdii}`);
  }

  lines.push("");
  lines.push("## 要求");
  lines.push(`- 从上述候选基金中选1只作为替代`);
  lines.push("- 优先选境内非QDII基金，除非池内仅有QDII");
  lines.push("- fund_code 和 fund_name 必须严格从候选池中复制，不得编造");
  lines.push("- recommendation_reason 用对客白话，避免内部术语，不写基金代码");
  lines.push("");
  lines.push(
    '请输出纯 JSON：{"fund_code":"...","fund_name":"...","recommendation_reason":"...","role_label":"..."}',
  );

  return lines.join("\n");
}

/** Parse the LLM response for a single fund replacement */
function parseReplaceResponse(
  text: string,
): { fund_code: string; fund_name: string; recommendation_reason: string; role_label?: string } | null {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  const tryParse = (s: string) => {
    try {
      const obj = JSON.parse(s);
      if (typeof obj.fund_code === "string" && typeof obj.fund_name === "string") {
        return obj as {
          fund_code: string;
          fund_name: string;
          recommendation_reason: string;
          role_label?: string;
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  let result = tryParse(cleaned);
  if (result) return result;

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) result = tryParse(match[0]);
  return result;
}

/**
 * Replace a fund in the plan: remove old → call LLM for replacement → build updated payload.
 * Returns the updated PlanDetailPayload ready for emitProposeTool.
 */
async function replaceFundInPlan(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  location: FundLocation,
): Promise<{
  ok: boolean;
  payload?: PlanDetailPayload;
  oldFundName?: string;
  newFundName?: string;
  error?: string;
}> {
  if (!supabase) return { ok: false, error: "数据库未连接。" };
  const cat = location.categories[location.categoryIndex]!;
  const removedItem = cat.items[location.itemIndex];
  if (!removedItem) {
    return { ok: false, error: "找不到要替换的基金。" };
  }

  const replacedCode = location.fundCode;
  const replacedName = location.fundName;
  const categoryName = location.categoryName;
  const categoryPct = cat.allocation_pct;

  // Collect existing fund codes in this category (including the one being removed)
  const existingCodes = new Set(cat.items.map((i) => i.fund_code));

  // Remove the fund from the category
  cat.items.splice(location.itemIndex, 1);

  // Get a model slot for LLM call
  let slot;
  try {
    slot = await ensureModelSlot("reasoning");
  } catch {
    return { ok: false, error: "模型配置不可用。" };
  }
  if (!slot) {
    return { ok: false, error: "reasoning 模型槽未配置。" };
  }

  // Build prompt and call LLM
  const prompt = buildReplacePrompt(categoryName, existingCodes, replacedCode, replacedName, categoryPct);
  if (!prompt) {
    return {
      ok: false,
      error: `「${categoryName}」中已无其他可选基金来替换 ${replacedName}。`,
    };
  }

  const systemPrompt = `你是一位资深基金投资顾问。请根据要求从候选池中选出1只替代基金，严格输出JSON格式。`;

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
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `替换基金 LLM 调用失败：${err instanceof Error ? err.message : "未知错误"}`,
    };
  }

  // Parse response (retry once)
  let parsed = parseReplaceResponse(raw);
  if (!parsed) {
    try {
      const retryRaw = await completeText(
        {
          api_base_url: slot.api_base_url,
          api_key: slot.api_key_encrypted,
          model_name: slot.model_name ?? "mimo-v2.5",
          provider: "mimo",
        },
        {
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 512,
          temperature: 0.1,
        },
      );
      parsed = parseReplaceResponse(retryRaw);
    } catch {
      // fall through
    }
  }

  if (!parsed) {
    return { ok: false, error: "LLM 未返回有效的替代基金信息。" };
  }

  // Validate that the replacement exists in the L0 registry
  if (!FUND_L0_REGISTRY[parsed.fund_code]) {
    return {
      ok: false,
      error: `推荐的替代基金 ${parsed.fund_code} 不在基金池中。`,
    };
  }

  // Normalize weights: old weight gets transferred proportionally
  // The removed item had some weight; assign the same weight to the new item
  const oldWeight = removedItem.weight_in_category ?? Math.round(100 / (cat.items.length + 1));
  const newWeight = oldWeight;
  const portfolioPct = Math.round((categoryPct * newWeight) / 100);

  // Add the new fund
  cat.items.push({
    fund_code: parsed.fund_code,
    fund_name: parsed.fund_name,
    weight_in_category: newWeight,
    allocation_pct_of_portfolio: portfolioPct,
    recommendation_reason: String(parsed.recommendation_reason ?? "").slice(0, 300),
    role_label: String(parsed.role_label ?? "").slice(0, 20),
  });

  // Re-normalize weights within category to sum to 100
  const rawWeightSum = cat.items.reduce((s, i) => s + (i.weight_in_category ?? 0), 0);
  if (rawWeightSum > 0 && rawWeightSum !== 100) {
    const scale = 100 / rawWeightSum;
    for (const item of cat.items) {
      item.weight_in_category = Math.round((item.weight_in_category ?? 0) * scale);
    }
  }

  // Fix rounding: ensure weight_in_category sums to 100
  const weightSum = cat.items.reduce((s, i) => s + (i.weight_in_category ?? 0), 0);
  if (cat.items.length > 0 && weightSum !== 100) {
    cat.items[0]!.weight_in_category = (cat.items[0]!.weight_in_category ?? 0) + (100 - weightSum);
  }

  // Recompute allocation_pct_of_portfolio for each item
  for (const item of cat.items) {
    item.allocation_pct_of_portfolio = Math.round(
      (categoryPct * (item.weight_in_category ?? 0)) / 100,
    );
  }

  // Fix rounding: ensure allocation_pct_of_portfolio sum matches categoryPct
  const portfolioSum = cat.items.reduce((s, i) => s + i.allocation_pct_of_portfolio, 0);
  const portfolioDiff = categoryPct - portfolioSum;
  if (cat.items.length > 0 && portfolioDiff !== 0) {
    cat.items[0]!.allocation_pct_of_portfolio += portfolioDiff;
  }

  // Build the updated payload
  // Re-read goal info for the payload
  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select("display_name, profile_version_id")
    .eq("id", location.goalConstraintId)
    .maybeSingle();

  const targetAllocationSummary: Record<string, number> = {};
  for (const c of location.categories) {
    targetAllocationSummary[c.category] = c.allocation_pct;
  }

  const payload: PlanDetailPayload = {
    kind: "plan_detail",
    goal_constraint_id: location.goalConstraintId,
    goal_display_name: goal?.display_name ?? location.goalDisplayName,
    profile_version_id: goal?.profile_version_id ?? undefined,
    target_allocation_summary: targetAllocationSummary,
    detailed_plan: { categories: location.categories },
    web_citations: [],
    card_title: `请确认：${goal?.display_name ?? "目标场景"} · 基金明细（已替换）`,
  };

  return {
    ok: true,
    payload,
    oldFundName: replacedName,
    newFundName: parsed.fund_name,
  };
}

/**
 * Re-run the entire fund detail propose flow, excluding specified funds.
 * This is used when the user is dissatisfied with specific fund(s) and wants
 * a complete re-planning rather than just a 1-for-1 replacement.
 */
async function replanWithExclusion(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  goalId: string,
  goalName: string | undefined,
  excludeFundCodes: string[],
  dissatisfactionReason?: string,
): Promise<{
  ok: boolean;
  payload?: PlanDetailPayload;
  excludedFundNames?: string[];
  error?: string;
}> {
  if (!supabase) return { ok: false, error: "数据库未连接。" };
  if (excludeFundCodes.length === 0) {
    return { ok: false, error: "未指定需要排除的基金。" };
  }

  // Read goal constraints
  const { data: goal } = await supabase
    .from("investment_goal_constraints")
    .select(
      "id, display_name, profile_version_id, goal_type, investment_constraints, principal_amount, monthly_amount",
    )
    .eq("id", goalId)
    .maybeSingle();

  if (!goal) {
    return { ok: false, error: "未找到投资需求组。" };
  }

  // Read step 1 allocation
  const { data: step1 } = await supabase
    .from("allocation_plans")
    .select("target_allocation")
    .eq("goal_constraint_id", goalId)
    .eq("plan_step", 1)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!step1?.target_allocation) {
    return { ok: false, error: "请先确认大类资产配置（第一步）。" };
  }

  // Collect excluded fund names for the response
  const excludedFundNames: string[] = [];
  for (const code of excludeFundCodes) {
    const fund = FUND_L0_REGISTRY[code];
    if (fund) {
      excludedFundNames.push(fund.fund_name);
    }
  }

  // Re-run the full propose flow with exclusion
  const proposed = await proposePlanDetail({
    goal_constraint_id: goalId,
    goal_display_name: goal.display_name ?? goalName,
    goal_type: goal.goal_type,
    profile_version_id: goal.profile_version_id,
    constraints: goal.investment_constraints as import("@/lib/profile/types").InvestmentConstraints,
    principal_amount: goal.principal_amount,
    monthly_amount: goal.monthly_amount,
    target_allocation: step1.target_allocation as PlanAllocationPayload["target_allocation"],
    excludeFundCodes,
    dissatisfactionReason,
  });

  if (!proposed.ok || !proposed.payload) {
    return { ok: false, error: proposed.error ?? "重新规划失败。" };
  }

  return {
    ok: true,
    payload: proposed.payload,
    excludedFundNames,
  };
}

export async function handleScenePlan(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
  plan: ExecutionPlan,
): Promise<{
  assistantContent: string;
  contentBlocks: ContentBlock[];
}> {
  if (plan.intent !== "scene_task") {
    throw new Error("plan handler 仅处理 scene_task");
  }

  const supabase = await getSupabase();
  const read = await planRead(supabase);
  const normalized = userMessage.trim();
  const contentBlocks: ContentBlock[] = [];
  let assistantContent = "";

  await writeStage(sse, state, {
    task_key: "plan.prep.check",
    status: "running",
  });

  let prepStageOpen = true;
  const closePlanPrep = async (status: "done" | "failed" = "done") => {
    if (!prepStageOpen) return;
    prepStageOpen = false;
    await writeStage(sse, state, { task_key: "plan.prep.check", status });
  };

  if (read.n === 0) {
    const profile = await profileRead(supabase);
    assistantContent = buildPlanBlockedReply(profile);
    await closePlanPrep("failed");
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  if (/^\/plan_read\b/i.test(normalized)) {
    const tool = await executeTool({ tool: "plan_read", input: {}, scene: "plan" });
    assistantContent = tool.preview || read.summary;
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  const goalId = read.goal_constraint_id;
  const goalName =
    read.eligible_groups.find((g) => g.goal_constraint_id === goalId)?.display_name;

  if (/生成大类|正式大类|联网大类/.test(normalized) && !/样例/.test(normalized)) {
    if (!goalId) {
      assistantContent =
        read.n >= 2
          ? "您有多个可用于生成方案的投资需求，请先说明要为哪一组生成方案（如「退休养老」）。"
          : "无法确定目标场景。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    const built = await buildPlanAllocationFormal(supabase, { goalConstraintId: goalId });
    if (!built.ok || !built.payload) {
      assistantContent = built.error ?? "生成大类配置失败。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "running" });
    const propose = await emitProposeTool(
      state,
      sse,
      built.payload as unknown as Record<string, unknown>,
      contentBlocks,
    );
    await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "done" });
    assistantContent = "已整理 **大类资产配置**，请核对比例与理由后确认。";
    await writeStage(sse, state, { task_key: "plan.s1.wait", status: "blocked" });
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }


  if (/生成明细|联网明细|正式明细/.test(normalized) && !/样例/.test(normalized)) {
    if (!goalId) {
      assistantContent = read.n >= 2 ? "请先指定目标场景。" : "无法确定目标场景。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    // 重新查询该场景的 has_step1，避免多场景时初始 planRead 未带 goalId 导致误判
    const detailRead = await planRead(supabase, goalId);
    if (!detailRead.has_step1) {
      assistantContent = "请先确认 **大类配置**，再生成基金明细。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, {
      task_key: "plan.s2.detail.screen",
      status: "running",
    });
    const built = await buildPlanDetailWithWeb(supabase, {
      goalConstraintId: goalId,
      goalDisplayName: goalName,
    });
    if (!built.ok || !built.payload) {
      assistantContent = built.error ?? "生成明细失败。";
      await writeStage(sse, state, {
        task_key: "plan.s2.detail.screen",
        status: "failed",
      });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, {
      task_key: "plan.s2.detail.screen",
      status: "done",
    });
    const propose = await emitProposeTool(
      state,
      sse,
      built.payload as unknown as Record<string, unknown>,
      contentBlocks,
    );
    assistantContent = [
      "已为您完成基金明细筛选，请查看下方确认卡。",
    ].join("\n");
    await writeStage(sse, state, { task_key: "plan.s2.wait", status: "blocked" });
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  // ── Fund Replacement: 对XXXX不满意 / 换掉XXXX ──
  // Now supports both:
  // 1. 1-for-1 replacement (换掉XXXX, 替换XXXX) → replaceFundInPlan
  // 2. Full re-plan with exclusion (对XXXX不满意) → replanWithExclusion
  const replacementCode = extractFundReplacementCode(normalized);
  if (replacementCode) {
    if (!goalId) {
      assistantContent = read.n >= 2
        ? "请先指定目标场景，再进行基金替换。"
        : "无法确定目标场景。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }

    // Check that step 2 (detail) has been confirmed
    const detailRead = await planRead(supabase, goalId);
    if (!detailRead.has_step2_current) {
      assistantContent = `基金 ${replacementCode} 尚未出现在已确认的基金明细中。请先完成 **基金明细**（第二步）后再替换。`;
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }

    // Find the fund in the current plan
    const location = await findFundInCurrentPlan(supabase, goalId, replacementCode);
    if (!location) {
      assistantContent = `在当前方案中未找到基金 ${replacementCode}。请确认该基金代码是否正确。`;
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }

    // Determine if this is a "dissatisfaction" (不满意) or "replacement" (换掉/替换) intent
    const isDissatisfaction = /不满意|不喜欢|不合适|不想要|不想|不好看/.test(normalized);
    
    if (isDissatisfaction) {
      // Full re-plan with exclusion: user is dissatisfied and wants complete re-planning
      await writeStage(sse, state, {
        task_key: "plan.s2.detail.replan",
        status: "running",
      });

      const result = await replanWithExclusion(
        supabase,
        goalId,
        goalName,
        [replacementCode],
        undefined, // dissatisfactionReason will be provided in follow-up if needed
      );

      if (!result.ok || !result.payload) {
        assistantContent = result.error ?? "重新规划失败。";
        await writeStage(sse, state, {
          task_key: "plan.s2.detail.replan",
          status: "failed",
        });
        await closePlanPrep();
        return finishPlanReply(sse, assistantContent, contentBlocks);
      }

      await writeStage(sse, state, {
        task_key: "plan.s2.detail.replan",
        status: "done",
      });

      const propose = await emitProposeTool(
        state,
        sse,
        result.payload as unknown as Record<string, unknown>,
        contentBlocks,
      );

      const excludedNames = result.excludedFundNames?.length
        ? `（已剔除：${result.excludedFundNames.join("、")}）`
        : "";
      assistantContent = [
        `已为您重新规划基金明细${excludedNames}，请查看下方确认卡。`,
        "",
        "如有其他不满意的基金，可继续告诉我，我会再次调整。",
      ].join("\n");

      await writeStage(sse, state, { task_key: "plan.s2.wait", status: "blocked" });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    } else {
      // 1-for-1 replacement: user explicitly wants to swap one fund for another
      await writeStage(sse, state, {
        task_key: "plan.s2.detail.replace",
        status: "running",
      });

      const result = await replaceFundInPlan(supabase, location);

      if (!result.ok || !result.payload) {
        assistantContent = result.error ?? "替换基金失败。";
        await writeStage(sse, state, {
          task_key: "plan.s2.detail.replace",
          status: "failed",
        });
        await closePlanPrep();
        return finishPlanReply(sse, assistantContent, contentBlocks);
      }

      await writeStage(sse, state, {
        task_key: "plan.s2.detail.replace",
        status: "done",
      });

      const propose = await emitProposeTool(
        state,
        sse,
        result.payload as unknown as Record<string, unknown>,
        contentBlocks,
      );

      assistantContent = [
        `已将 **${result.oldFundName}**（${replacementCode}）替换为 **${result.newFundName}**，请查看下方确认卡。`,
      ].join("\n");

      await writeStage(sse, state, { task_key: "plan.s2.wait", status: "blocked" });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
  }

  const reportScenarioMatch = normalized.match(/生成【(.+?)】资产配置报告/);
  if (reportScenarioMatch) {
    const scenarioName = reportScenarioMatch[1].trim();
    const targetGroup = read.eligible_groups.find(
      (g) => g.display_name === scenarioName || g.display_name.includes(scenarioName),
    );
    if (!targetGroup) {
      assistantContent = `未找到「${scenarioName}」场景，请确认名称是否正确。可选：${read.eligible_groups.map((g) => g.display_name).join("、")}`;
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    const targetGoalId = targetGroup.goal_constraint_id;
    const targetRead = await planRead(supabase, targetGoalId);
    if (!targetRead.has_step2_current) {
      assistantContent = `请先确认「${scenarioName}」的 **基金明细**（第二步），再生成报告。`;
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, {
      task_key: "plan.rpt.draft",
      status: "running",
    });
    const tool = await executeTool({
      tool: "report_draft",
      input: { report_type: "plan", goal_constraint_id: targetGoalId },
      scene: "plan",
      conversationId: state.conversationId,
      runId: state.runId,
    });
    if (!tool.ok) {
      assistantContent = tool.error ?? "生成报告草稿失败。";
      await writeStage(sse, state, {
        task_key: "plan.rpt.draft",
        status: "failed",
      });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    const data = tool.data as { report_name?: string; draft_path?: string; preview?: string };
    await writeStage(sse, state, {
      task_key: "plan.rpt.draft",
      status: "done",
    });
    const card: ReportPublishCardBlock = {
      type: "report_publish_card",
      status: "active",
      report_type: "plan",
      goal_constraint_id: targetGoalId,
      report_name: data.report_name ?? "资产配置方案",
      file_path: data.draft_path,
    };
    contentBlocks.push(card);
    sse.write("content_block", card);
    assistantContent = "";
    await writeStage(sse, state, { task_key: "plan.rpt.wait", status: "blocked" });
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  if (/生成规划书|规划书|资产配置方案/.test(normalized)) {
    if (!goalId) {
      assistantContent = "请先完成方案两步确认，或指定目标场景。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    if (!read.has_step2_current) {
      assistantContent =
        "请先确认 **基金明细**（第二步），再生成《资产配置方案》。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, {
      task_key: "plan.rpt.draft",
      status: "running",
    });
    const tool = await executeTool({
      tool: "report_draft",
      input: { report_type: "plan", goal_constraint_id: goalId },
      scene: "plan",
      conversationId: state.conversationId,
      runId: state.runId,
    });
    if (!tool.ok) {
      assistantContent = tool.error ?? "生成规划书草稿失败。";
      await writeStage(sse, state, {
        task_key: "plan.rpt.draft",
        status: "failed",
      });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    const data = tool.data as { report_name?: string; draft_path?: string; preview?: string };
    await writeStage(sse, state, {
      task_key: "plan.rpt.draft",
      status: "done",
    });
    const card: ReportPublishCardBlock = {
      type: "report_publish_card",
      status: "active",
      report_type: "plan",
      goal_constraint_id: goalId,
      report_name: data.report_name ?? "资产配置方案",
      file_path: data.draft_path,
    };
    contentBlocks.push(card);
    sse.write("content_block", card);
    assistantContent = "";
    await writeStage(sse, state, { task_key: "plan.rpt.wait", status: "blocked" });
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  // Scene name parsing: user says "针对XXX场景进行资产配置" → direct 大类 generation
  // 或者 "针对XXX场景进行基金明细" → direct 基金明细 generation
  const sceneMatch = findSceneByName(normalized, read.eligible_groups);
  if (sceneMatch) {
    const goalId = sceneMatch.goal_constraint_id;
    if (!goalId) {
      assistantContent = "无法确定目标场景。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }

    // 检查用户输入是否包含基金明细关键词
    const isDetailRequest = /基金明细|明细|选基金|出明细|明细方案/.test(normalized);

    if (isDetailRequest) {
      // 用户请求基金明细，需要先检查该场景是否已确认大类配置
      // 注意：当有多个场景时，初始 planRead 未带 goalId 导致 has_step1 可能不准确，需重新查询
      const sceneRead = await planRead(supabase, goalId);
      if (!sceneRead.has_step1) {
        assistantContent = "请先确认 **大类配置**，再生成基金明细。";
        await closePlanPrep();
        return finishPlanReply(sse, assistantContent, contentBlocks);
      }
      
      // 触发基金明细生成
      await writeStage(sse, state, {
        task_key: "plan.s2.detail.screen",
        status: "running",
      });
      const built = await buildPlanDetailWithWeb(supabase, {
        goalConstraintId: goalId,
        goalDisplayName: sceneMatch.display_name,
      });
      if (!built.ok || !built.payload) {
        assistantContent = built.error ?? "生成明细失败。";
        await writeStage(sse, state, {
          task_key: "plan.s2.detail.screen",
          status: "failed",
        });
        await closePlanPrep();
        return finishPlanReply(sse, assistantContent, contentBlocks);
      }
      await writeStage(sse, state, {
        task_key: "plan.s2.detail.screen",
        status: "done",
      });
      const propose = await emitProposeTool(
        state,
        sse,
        built.payload as unknown as Record<string, unknown>,
        contentBlocks,
      );
      assistantContent = [
        `已为「${sceneMatch.display_name}」完成基金明细筛选，请查看下方确认卡。`,
      ].join("\n");
      await writeStage(sse, state, { task_key: "plan.s2.wait", status: "blocked" });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    
    // 默认触发大类配置
    const built = await buildPlanAllocationFormal(supabase, { goalConstraintId: goalId });
    if (!built.ok || !built.payload) {
      assistantContent = built.error ?? "生成大类配置失败。";
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "running" });
    const propose = await emitProposeTool(
      state,
      sse,
      built.payload as unknown as Record<string, unknown>,
      contentBlocks,
    );
    await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "done" });
    assistantContent = `已为「${sceneMatch.display_name}」整理 **大类资产配置**，请核对比例与理由后确认。`;
    await writeStage(sse, state, { task_key: "plan.s1.wait", status: "blocked" });
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  // User tried to specify a scene but it doesn't match any eligible group
  if (/针对|给.*做|为.*出|场景|方案/.test(normalized)) {
    const mentionedName = extractMentionedSceneName(normalized);
    if (mentionedName) {
      assistantContent = `「${mentionedName}」场景尚未完成需求梳理，请先到「需求梳理」完成并保存。`;
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
  }

  if (/开始|生成方案|资产配置|大类/.test(normalized)) {
    if (read.n === 1 && read.goal_constraint_id) {
      // N=1: auto-trigger 大类 generation
      const built = await buildPlanAllocationFormal(supabase, { goalConstraintId: read.goal_constraint_id });
      if (!built.ok || !built.payload) {
        assistantContent = built.error ?? "生成大类配置失败。";
        await closePlanPrep();
        return finishPlanReply(sse, assistantContent, contentBlocks);
      }
      await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "running" });
      const propose = await emitProposeTool(
        state,
        sse,
        built.payload as unknown as Record<string, unknown>,
        contentBlocks,
      );
      await writeStage(sse, state, { task_key: "plan.s1.allocation.propose", status: "done" });
      assistantContent = "已整理 **大类资产配置**，请核对比例与理由后确认。";
      await writeStage(sse, state, { task_key: "plan.s1.wait", status: "blocked" });
      await closePlanPrep();
      return finishPlanReply(sse, assistantContent, contentBlocks);
    }
    // N≥2: ask which group
    const names = read.eligible_groups.map((g) => g.display_name).join("、");
    assistantContent = [
      read.summary,
      "",
      PLAN_START_HINT,
      `可选：${names}。请先告诉我要为哪一组出方案。`,
    ].join("\n");
    await closePlanPrep();
    return finishPlanReply(sse, assistantContent, contentBlocks);
  }

  assistantContent = [read.summary, "", PLAN_START_HINT].join("\n");
  await closePlanPrep();
  return finishPlanReply(sse, assistantContent, contentBlocks);
}
