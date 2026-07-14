import type { PlanAllocationPayload, PlanDetailPayload } from "@/lib/plan/types";

export interface PlanHookContext {
  constraints?: {
    investment_horizon?: string;
    risk_tolerance?: string;
    max_drawdown?: string | number;
    expected_return?: string | number;
    liquidity_need?: string;
    deploy_mode?: string;
    investment_scope?: string;
  };
  principal_amount?: number;
  monthly_amount?: number;
  monthly_investable?: number;
  financial_assets?: number;
  active_goal_amounts?: number[];
  goal_type?: string;
  screened?: boolean;
  web_citations?: unknown[];
  forbidden_categories?: string[];
}

export interface PlanHookResult {
  ok: boolean;
  failures: string[];
}

function parsePct(v: string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const m = String(v).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function equityPct(payload: PlanAllocationPayload | PlanDetailPayload): number {
  if ("target_allocation" in payload && payload.target_allocation?.categories) {
    return (
      payload.target_allocation.categories.find((c) => c.category === "股票类")
        ?.allocation_pct ?? 0
    );
  }
  const summary = (payload as PlanDetailPayload).target_allocation_summary ?? {};
  return summary["股票类"] ?? 0;
}

function hasCommodity(categories: Array<{ category: string }>): boolean {
  return categories.some((c) => /商品/.test(c.category));
}

function detailCategories(payload: PlanDetailPayload): Array<{
  category: string;
  items?: Array<{ fund_code?: string; recommendation_reason?: string; allocation_pct_of_portfolio?: number }>;
}> {
  return (
    (payload.detailed_plan as {
      categories?: Array<{
        category: string;
        items?: Array<{
          fund_code?: string;
          recommendation_reason?: string;
          allocation_pct_of_portfolio?: number;
        }>;
      }>;
    }).categories ?? []
  );
}

export function planCheckConflicts(
  payload: PlanAllocationPayload | PlanDetailPayload,
  step: 1 | 2,
  ctx: PlanHookContext = {},
): PlanHookResult {
  const failures: string[] = [];
  const constraints = ctx.constraints ?? {};

  if (payload.kind === "plan_allocation") {
    const sum = payload.target_allocation.categories.reduce(
      (s, c) => s + c.allocation_pct,
      0,
    );
    if (Math.abs(sum - 100) > 0.5) {
      failures.push(`#1 大类比例之和 ${sum}%，须为 100%（±0.5%）。`);
    }
    if (hasCommodity(payload.target_allocation.categories)) {
      failures.push("#6 禁止商品类出现在大类配置。");
    }
    if (!String(payload.allocation_rationale ?? "").trim()) {
      failures.push("#10 缺少 allocation_rationale。");
    }

    const eq = equityPct(payload);
    const dd = parsePct(constraints.max_drawdown) ?? 15;
    const cap =
      dd <= 10 ? 15 : dd <= 15 ? 30 : dd <= 20 ? 45 : 65;
    if (eq > cap + 5) {
      failures.push(`#2 权益 ${eq}% 与回撤/风险档位（上限约 ${cap}%）明显不匹配。`);
    }

    const expected = parsePct(constraints.expected_return) ?? 5;
    const implied = eq * 0.08 + (100 - eq) * 0.03;
    if (Math.abs(implied - expected) > 4) {
      failures.push("#3 隐含收益与期望收益偏差较大。");
    }

    if (/短|1年|2年|3年/.test(String(constraints.investment_horizon)) && eq > 35) {
      failures.push("#4 投资期限较短但权益偏高。");
    }
  }

  if (step === 2 && payload.kind === "plan_detail") {
    const cats = detailCategories(payload);
    if (hasCommodity(cats)) {
      failures.push("#16 明细含禁止的商品类。");
    }

    for (const cat of cats) {
      for (const item of cat.items ?? []) {
        const code = String(item.fund_code ?? "");
        if (!/^\d{6}$/.test(code)) {
          failures.push(`#14 无效 fund_code：${code}`);
        }
        if (!String(item.recommendation_reason ?? "").trim()) {
          failures.push(`#15 ${code} 缺少 recommendation_reason。`);
        }
      }
    }

    const summary = payload.target_allocation_summary ?? {};
    for (const cat of cats) {
      const target = summary[cat.category];
      if (target == null) continue;
      const sumItems = (cat.items ?? []).reduce(
        (s, i) => s + Number((i as { allocation_pct_of_portfolio?: number }).allocation_pct_of_portfolio ?? 0),
        0,
      );
      if (Math.abs(sumItems - target) > 1) {
        failures.push(`#13 ${cat.category} 明细权重 ${sumItems}% 与目标 ${target}% 不一致。`);
      }
    }

    if (/分批|定投|phased/i.test(String(constraints.deploy_mode))) {
      const sched = payload.execution_schedule ?? {};
      if (!sched.deploy_frequency) {
        failures.push("#11 分批模式但缺 deploy_frequency。");
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

export function planCheckCompleteness(
  payload: PlanAllocationPayload | PlanDetailPayload,
  step: 1 | 2,
  ctx: PlanHookContext = {},
): PlanHookResult {
  const failures: string[] = [];
  const constraints = ctx.constraints ?? {};

  if (step === 1 && payload.kind === "plan_allocation") {
    const rationale = String(payload.allocation_rationale ?? "");
    if (rationale.length < 40) {
      failures.push("Hook2#1 allocation_rationale 段落过短。");
    }
    if (
      !/流动|回撤|期限/.test(rationale) &&
      !/流动/.test(String(constraints.liquidity_need))
    ) {
      failures.push("Hook2#2 大类 rationale 宜提及流动性或回撤边界。");
    }
  }

  if (step === 2 && payload.kind === "plan_detail") {
    if (!ctx.screened) {
      failures.push("Hook2#4 须先调用 plan_screen_funds 全市场初筛。");
    }

    const cats = detailCategories(payload);
    for (const cat of cats) {
      if ((cat.items?.length ?? 0) === 0 && cat.category !== "商品类") {
        failures.push(`Hook2#6 ${cat.category} 下无 fund_code。`);
      }
    }

    if (!payload.execution_schedule?.fund_deploy) {
      failures.push("Hook2#8 execution_schedule 不完整。");
    }

    const moneyDeploy = (
      payload.execution_schedule as { fund_deploy?: Array<{ fund_code: string; dca_in_periodic?: boolean }> }
    )?.fund_deploy?.find((f) => {
      const cat = cats.find((c) =>
        c.items?.some((i) => (i as { fund_code: string }).fund_code === f.fund_code),
      );
      return cat?.category === "货币类";
    });
    if (moneyDeploy?.dca_in_periodic === true) {
      failures.push("Hook2 D2 货币类 dca_in_periodic 须为 false。");
    }

    if (/education|housing|education|买房|教育/.test(ctx.goal_type ?? "")) {
      const text = JSON.stringify(payload.execution_schedule ?? {}) + JSON.stringify(payload.detailed_plan);
      if (!/流动|到期|取出|降权益/.test(text)) {
        failures.push("Hook2#5 教育/买房约束宜体现到期前流动性。");
      }
    }
  }

  return { ok: failures.length === 0, failures };
}
