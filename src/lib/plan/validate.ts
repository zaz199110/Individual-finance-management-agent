import type { PlanAllocationPayload, PlanDetailPayload } from "./types";

export function validatePlanAllocation(raw: unknown): {
  ok: boolean;
  errors: string[];
  data?: PlanAllocationPayload;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["plan_allocation 须为对象。"] };
  }
  const o = raw as Record<string, unknown>;
  const goalId = String(o.goal_constraint_id ?? "");
  if (!goalId) errors.push("缺少 goal_constraint_id。");

  const ta = o.target_allocation as Record<string, unknown> | undefined;
  if (!ta || !Array.isArray(ta.categories) || ta.categories.length === 0) {
    errors.push("target_allocation.categories 必填。");
  } else {
    let sum = 0;
    for (const c of ta.categories as Array<Record<string, unknown>>) {
      const pct = Number(c.allocation_pct);
      if (!Number.isFinite(pct) || pct < 0) errors.push("allocation_pct 无效。");
      else sum += pct;
    }
    if (Math.abs(sum - 100) > 0.5) {
      errors.push(`大类比例之和须为 100%（当前 ${sum}）。`);
    }
  }

  if (!String(o.allocation_rationale ?? "").trim()) {
    errors.push("allocation_rationale 必填。");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    data: o as unknown as PlanAllocationPayload,
  };
}

export function validatePlanDetail(raw: unknown): {
  ok: boolean;
  errors: string[];
  data?: PlanDetailPayload;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["plan_detail 须为对象。"] };
  }
  const o = raw as Record<string, unknown>;
  if (!String(o.goal_constraint_id ?? "")) errors.push("缺少 goal_constraint_id。");
  if (!o.detailed_plan || typeof o.detailed_plan !== "object") {
    errors.push("detailed_plan 必填。");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], data: o as unknown as PlanDetailPayload };
}

export function formatPlanAllocationCardBody(p: PlanAllocationPayload): string {
  const lines = [
    `针对目标：${p.goal_display_name ?? p.goal_constraint_id}`,
    "",
    "大类配置：",
  ];
  for (const c of p.target_allocation.categories) {
    lines.push(`- ${c.category}：${c.allocation_pct}%`);
  }
  lines.push("", "配置理由：", p.allocation_rationale);
  return lines.join("\n");
}

export function formatPlanDetailCardBody(p: PlanDetailPayload): string {
  const cats = (p.detailed_plan as { categories?: unknown[] }).categories ?? [];
  const typedCats = cats as Array<{
    category?: string;
    allocation_pct?: number;
    items?: Array<{
      fund_code?: string;
      fund_name?: string;
      weight_in_category?: number;
      allocation_pct_of_portfolio?: number;
      recommendation_reason?: string;
    }>;
    structure_note?: string;
  }>;

  // 计算拟定买入总金额
  let totalAmount = 0;
  for (const cat of typedCats) {
    for (const item of cat.items ?? []) {
      // allocation_pct_of_portfolio 是该基金占组合的百分比
      // 总金额需要从 execution_schedule 或 target_allocation_summary 获取
    }
  }

  const lines: string[] = [];

  // 标题行
  lines.push(`针对目标：${p.goal_display_name ?? p.goal_constraint_id}`);
  lines.push("");

  // 各大类基金明细
  for (const cat of typedCats) {
    if (!cat.category) continue;
    const catPct = cat.allocation_pct ?? 0;
    lines.push(`【${cat.category} ${catPct}%】`);

    for (const item of cat.items ?? []) {
      const code = item.fund_code ?? "";
      const name = item.fund_name ?? "";
      const portfolioPct = item.allocation_pct_of_portfolio ?? 0;
      const reason = item.recommendation_reason ?? "";

      lines.push(`· ${code} ${name}（组合占比 ${portfolioPct}%）`);
      if (reason) {
        lines.push(`  推荐理由：${reason}`);
      }
    }
    lines.push("");
  }

  // 执行安排
  if (p.execution_schedule?.deploy_summary_zh) {
    lines.push(`执行安排：${String(p.execution_schedule.deploy_summary_zh)}`);
  }

  return lines.filter(Boolean).join("\n");
}
