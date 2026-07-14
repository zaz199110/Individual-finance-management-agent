import type { PlanDetailCategory, PlanFundItem } from "./plan-report-blueprint";

export interface FundDeployRule {
  fund_code: string;
  deploy_pattern: "initial_full" | "initial_majority" | "dca_only" | "initial_minority";
  initial_pct_of_fund_target: number;
  dca_in_periodic: boolean;
  note: string;
}

export interface ExecutionScheduleResult {
  deploy_mode: "phased";
  deploy_frequency: string;
  deploy_periods: number;
  period_new_cash_cny: number;
  existing_lump_cny: number;
  deploy_summary_zh: string;
  fund_deploy: FundDeployRule[];
  initial_table: Array<{
    fund_code: string;
    fund_name: string;
    initial_cny: number;
    initial_pct: number;
    note?: string;
  }>;
  periodic_table: Array<{
    fund_code: string;
    fund_name: string;
    per_period_cny: number;
    note?: string;
  }>;
}

function parsePeriods(deployMode: string, principal: number, monthly: number): number {
  const m = deployMode.match(/(\d+)\s*个?月/);
  if (m) return Number(m[1]);
  if (monthly > 0 && principal > 0) return Math.ceil(principal / monthly);
  return 24;
}

function fundTargetCny(
  item: PlanFundItem,
  totalAmount: number,
): number {
  return Math.round((totalAmount * item.allocation_pct_of_portfolio) / 100);
}

export function buildExecutionSchedule(input: {
  categories: PlanDetailCategory[];
  principalAmount: number;
  monthlyAmount: number;
  deployMode: string;
  totalAmountCny?: number;
}): ExecutionScheduleResult {
  const periods = parsePeriods(
    input.deployMode,
    input.principalAmount,
    input.monthlyAmount,
  );
  const totalAmount =
    input.totalAmountCny ??
    input.principalAmount + input.monthlyAmount * periods;

  const allItems: Array<PlanFundItem & { category: string; fund_name: string }> = [];
  for (const cat of input.categories) {
    for (const item of cat.items) {
      allItems.push({ ...item, category: cat.category });
    }
  }

  const fund_deploy: FundDeployRule[] = allItems.map((item) => {
    if (item.category === "货币类") {
      return {
        fund_code: item.fund_code,
        deploy_pattern: "initial_full",
        initial_pct_of_fund_target: 100,
        dca_in_periodic: false,
        note: "货币净值几乎不动，无择时意义，首期配满。",
      };
    }
    if (item.category === "债券类") {
      const isSecondary = /二级|混债|安泰|产业/.test(item.fund_name);
      return {
        fund_code: item.fund_code,
        deploy_pattern: "initial_majority",
        initial_pct_of_fund_target: isSecondary ? 50 : 60,
        dca_in_periodic: true,
        note: isSecondary
          ? "二级债含权，波动接近权益侧；首期约一半，定投补齐。"
          : "信用债有利差波动；首期建大部分底仓，剩余用定投平滑利率时点。",
      };
    }
    const isSatellite = /行业|消费|科技|主题/.test(item.fund_name);
    return {
      fund_code: item.fund_code,
      deploy_pattern: isSatellite ? "dca_only" : "initial_minority",
      initial_pct_of_fund_target: isSatellite ? 0 : 20,
      dca_in_periodic: true,
      note: isSatellite ? "卫星由定投启动。" : "权益试水，分批参与。",
    };
  });

  const initial_table: ExecutionScheduleResult["initial_table"] = [];
  const periodic_table: ExecutionScheduleResult["periodic_table"] = [];

  const dcaFunds = fund_deploy.filter((f) => f.dca_in_periodic);
  const dcaWeightSum = dcaFunds.reduce((s, f) => {
    const item = allItems.find((i) => i.fund_code === f.fund_code)!;
    return s + item.allocation_pct_of_portfolio;
  }, 0);

  for (const rule of fund_deploy) {
    const item = allItems.find((i) => i.fund_code === rule.fund_code)!;
    const target = fundTargetCny(item, totalAmount);
    const initialCny = Math.round((target * rule.initial_pct_of_fund_target) / 100);

    initial_table.push({
      fund_code: item.fund_code,
      fund_name: item.fund_name,
      initial_cny: initialCny,
      initial_pct: rule.initial_pct_of_fund_target,
      note: rule.note,
    });

    if (rule.dca_in_periodic && dcaWeightSum > 0) {
      const share = item.allocation_pct_of_portfolio / dcaWeightSum;
      periodic_table.push({
        fund_code: item.fund_code,
        fund_name: item.fund_name,
        per_period_cny: Math.round(input.monthlyAmount * share),
        note: rule.dca_in_periodic ? "定投池" : "已在首期配满",
      });
    } else if (!rule.dca_in_periodic) {
      periodic_table.push({
        fund_code: item.fund_code,
        fund_name: item.fund_name,
        per_period_cny: 0,
        note: "已在首期配满",
      });
    }
  }

  const periodSum = periodic_table.reduce((s, r) => s + r.per_period_cny, 0);
  if (periodSum !== input.monthlyAmount && periodic_table.length) {
    const diff = input.monthlyAmount - periodSum;
    const last = periodic_table.find((r) => r.per_period_cny > 0);
    if (last) last.per_period_cny += diff;
  }

  return {
    deploy_mode: "phased",
    deploy_frequency: "每月",
    deploy_periods: periods,
    period_new_cash_cny: input.monthlyAmount,
    existing_lump_cny: input.principalAmount,
    deploy_summary_zh: `首期配满货币与大部分债券；股票与其余债券分 ${periods} 期定投，货币不参与按期定投。`,
    fund_deploy,
    initial_table,
    periodic_table,
  };
}

