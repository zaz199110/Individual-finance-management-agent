import type { InvestmentConstraints } from "@/lib/profile/types";
import {
  deriveRelativeMetrics,
  type RelativeMetrics,
} from "@/lib/profile/report-blueprint";
import type { PlanRiskMetrics } from "./risk-index";
import type { TargetAllocationCategory } from "./types";

export const PLAN_CHART_COLORS = {
  stock: "#22c55e",
  bond: "#3b82f6",
  cash: "#94a3b8",
} as const;

export interface PlanFundItem {
  fund_code: string;
  fund_name: string;
  weight_in_category?: number;
  allocation_pct_of_portfolio: number;
  recommendation_reason: string;
  role_label?: string;
}

export interface PlanDetailCategory {
  category: string;
  allocation_pct: number;
  items: PlanFundItem[];
  structure_note?: string;
}

export interface PlanReportComposeInput {
  sceneName: string;
  goalType: string;
  ymd: string;
  dateLabel: string;
  asOfDate: string;
  basicInfo?: import("@/lib/profile/types").BasicInfo;
  constraints: InvestmentConstraints;
  principalAmount: number;
  monthlyAmount: number;
  profileReportId?: string;
  targetAllocation: { total_amount_cny?: number; categories: TargetAllocationCategory[] };
  allocationRationale: string;
  detailedPlan: { categories: PlanDetailCategory[] };
  executionSchedule?: Record<string, unknown>;
  webCitations?: Array<{ title: string; url?: string }>;
  section3Markdown?: string;
  riskMetrics: PlanRiskMetrics;
}

export interface PlanReportComposeResult {
  markdown: string;
  echartsCount: number;
  relativeMetrics: RelativeMetrics;
  section3Draft: string;
}

function fmtYuan(n: number): string {
  return n.toLocaleString("zh-CN");
}

function pctMap(categories: TargetAllocationCategory[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of categories) m[c.category] = c.allocation_pct;
  return m;
}

function totalDeployAmount(
  principal: number,
  monthly: number,
  periods: number,
): number {
  return principal + monthly * periods;
}

function parseDeployPeriods(
  constraints: Record<string, unknown>,
  principal: number,
  monthly: number,
): number {
  // 1. 优先使用 dca_completion_months
  const dcaMonths = constraints.dca_completion_months as string | undefined;
  if (dcaMonths) {
    const m = dcaMonths.match(/(\d+)\s*月?/);
    if (m) return Number(m[1]);
  }
  // 2. 回退：deploy_mode
  const deployMode = String(constraints.deploy_mode ?? "");
  const dm = deployMode.match(/(\d+)\s*个?月/);
  if (dm) return Number(dm[1]);
  // 3. 最终回退
  if (monthly > 0 && principal > 0) return Math.ceil(principal / monthly);
  return 24;
}

export function buildCategoryPieChart(categories: TargetAllocationCategory[]): string {
  const data = categories.map((c) => ({
    value: c.allocation_pct,
    name: c.category,
  }));
  return `\`\`\`echarts
{
  "title": {
    "text": "大类资产配置目标比例",
    "subtext": "占整个组合 · 合计 100%",
    "left": "center",
    "textStyle": { "fontSize": 16, "fontWeight": 600, "color": "#1e293b" },
    "subtextStyle": { "fontSize": 11, "color": "#64748b" }
  },
  "tooltip": { "trigger": "item", "formatter": "{b}: {c}%" },
  "legend": { "orient": "horizontal", "bottom": 0 },
  "color": ["${PLAN_CHART_COLORS.stock}", "${PLAN_CHART_COLORS.bond}", "${PLAN_CHART_COLORS.cash}"],
  "series": [{
    "type": "pie",
    "radius": ["45%", "72%"],
    "center": ["50%", "46%"],
    "itemStyle": { "borderRadius": 8, "borderColor": "#fff", "borderWidth": 3 },
    "label": { "formatter": "{b}\\n{c}%" },
    "data": ${JSON.stringify(data)}
  }]
}
\`\`\``;
}

export function buildDetailStackedBar(categories: PlanDetailCategory[]): string {
  const items: Array<{ label: string; stock: number; bond: number; cash: number }> = [];
  for (const cat of categories) {
    for (const item of cat.items) {
      const short =
        item.fund_code +
        " " +
        (cat.category === "股票类" ? "股" : cat.category === "债券类" ? "债" : "货");
      items.push({
        label: short,
        stock: cat.category === "股票类" ? item.allocation_pct_of_portfolio : 0,
        bond: cat.category === "债券类" ? item.allocation_pct_of_portfolio : 0,
        cash: cat.category === "货币类" ? item.allocation_pct_of_portfolio : 0,
      });
    }
  }
  items.sort(
    (a, b) =>
      a.stock + a.bond + a.cash - (b.stock + b.bond + b.cash),
  );

  const yData = items.map((i) => i.label);
  const stockData = items.map((i) => i.stock);
  const bondData = items.map((i) => i.bond);
  const cashData = items.map((i) => i.cash);
  const maxVal = Math.max(...items.map((i) => i.stock + i.bond + i.cash), 10);

  return `\`\`\`echarts
{
  "title": {
    "text": "各基金占组合目标权重",
    "subtext": "单位：% · 绿=股票 · 蓝=债券 · 灰=货币",
    "left": "center",
    "textStyle": { "fontSize": 16, "fontWeight": 600, "color": "#1e293b" },
    "subtextStyle": { "fontSize": 11, "color": "#64748b" }
  },
  "tooltip": { "trigger": "axis", "axisPointer": { "type": "shadow" } },
  "legend": { "data": ["股票类", "债券类", "货币类"], "bottom": 0 },
  "grid": { "left": "3%", "right": "10%", "bottom": "14%", "containLabel": true },
  "xAxis": { "type": "value", "name": "占组合(%)", "max": ${Math.ceil(maxVal * 1.2) } },
  "yAxis": { "type": "category", "data": ${JSON.stringify(yData)} },
  "series": [
    { "name": "股票类", "type": "bar", "stack": "t", "itemStyle": { "color": "${PLAN_CHART_COLORS.stock}" }, "data": ${JSON.stringify(stockData)} },
    { "name": "债券类", "type": "bar", "stack": "t", "itemStyle": { "color": "${PLAN_CHART_COLORS.bond}" }, "data": ${JSON.stringify(bondData)} },
    { "name": "货币类", "type": "bar", "stack": "t", "itemStyle": { "color": "${PLAN_CHART_COLORS.cash}" }, "data": ${JSON.stringify(cashData)} }
  ]
}
\`\`\``;
}

export function buildEquitySectorPie(stockCategory?: PlanDetailCategory): string | null {
  if (!stockCategory?.items.length) return null;
  const data = stockCategory.items.map((item) => ({
    value: item.weight_in_category ?? Math.round(100 / stockCategory.items.length),
    name: item.role_label ?? item.fund_name.slice(0, 6),
  }));
  return `\`\`\`echarts
{
  "title": {
    "text": "股票类 · 类内结构",
    "subtext": "类内权重 % · 债券/货币见上表",
    "left": "center",
    "textStyle": { "fontSize": 15, "fontWeight": 600, "color": "#1e293b" },
    "subtextStyle": { "fontSize": 11, "color": "#64748b" }
  },
  "tooltip": { "trigger": "item" },
  "color": ["#22c55e", "#16a34a", "#86efac"],
  "series": [{
    "type": "pie",
    "radius": ["40%", "65%"],
    "center": ["50%", "50%"],
    "label": { "formatter": "{b}\\n{c}%" },
    "data": ${JSON.stringify(data)}
  }]
}
\`\`\``;
}

function buildSection3Draft(input: PlanReportComposeInput): string {
  if (input.section3Markdown?.trim()) return input.section3Markdown.trim();

  const rationaleRows = [
    "| **回撤边界** | 股票类比例与您的 **" +
      input.constraints.max_drawdown +
      "** 边界对齐 |",
    "| **投资期限** | **" +
      ((input.constraints as unknown as Record<string, unknown>)["investment_duration"] ?? "未知") +
      "** · 专项储备 |",
    "| **流动性分层** | 货币应急 · 债券缓冲 · 权益长期增值 |",
  ];

  const citationRows =
    input.webCitations?.slice(0, 3).map((c, i) => {
      const title = c.title || `公开资讯 ${i + 1}`;
      return `| ${title.slice(0, 20)} | 公开资讯摘要 | 供配置语境参考 |`;
    }) ?? [];

  return [
    "### 为什么这样配大类？",
    "",
    "| 逻辑 | 说明 |",
    "|------|------|",
    ...rationaleRows,
    "",
    "### 近期市场背景（公开资讯摘要）",
    "",
    citationRows.length
      ? ["| 主题 | 要点 | 对方案的影响 |", "|------|------|--------------|", ...citationRows].join(
          "\n",
        )
      : "公开资讯检索结果已纳入第二步讨论；**不构成**对后市的承诺。",
    "",
    "> 以上来自公开资讯检索，**不构成** 对后市的承诺。",
  ].join("\n");
}

function buildExecutionSection(schedule?: Record<string, unknown>): string {
  if (!schedule) {
    return "（执行安排待确认后写入。）";
  }

  const lines: string[] = [
    "| 加仓时间 | 基金中文简称 | 基金代码 | 拟定买入金额 |",
    "|----------|--------------|----------|--------------|",
  ];

  const initial = schedule.initial_table as
    | Array<{
        fund_code: string;
        fund_name: string;
        initial_cny: number;
        initial_pct: number;
        note?: string;
      }>
    | undefined;
  const periodic = schedule.periodic_table as
    | Array<{
        fund_code: string;
        fund_name: string;
        per_period_cny: number;
        note?: string;
      }>
    | undefined;

  if (initial?.length) {
    for (const row of initial) {
      lines.push(
        `| 第 1 个月 | ${row.fund_name} | ${row.fund_code} | ${fmtYuan(row.initial_cny)} 元 |`,
      );
    }
  }

  if (periodic?.length) {
    const periods = schedule.deploy_periods ?? "—";
    for (const row of periodic) {
      lines.push(
        `| 第 2-${periods} 个月 | ${row.fund_name} | ${row.fund_code} | 每月 ${fmtYuan(row.per_period_cny)} 元 |`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildFundTables(categories: PlanDetailCategory[]): string {
  const parts: string[] = [
    "产品配置范围是中国公募基金。",
    "",
    "| 基金名称 | 基金代码 | 资产类别 | 占组合 |",
    "|----------|----------|----------|--------|",
  ];
  for (const cat of categories) {
    for (const item of cat.items) {
      const assetType = cat.category === "股票类" ? "股票" : cat.category === "债券类" ? "债券" : "货币";
      parts.push(
        `| ${item.fund_name} | ${item.fund_code} | ${assetType} | **${item.allocation_pct_of_portfolio}%** |`,
      );
    }
  }
  parts.push("");
  return parts.join("\n");
}

function buildScenarioRows(input: PlanReportComposeInput): string {
  const c = input.constraints as unknown as Record<string, unknown>;
  const rows: string[] = [];

  // 严格按照图2展示【投资场景需求】章节的字段
  if (c.risk_tolerance) {
    rows.push(`| **风险偏好** | **${c.risk_tolerance}** |`);
  }
  if (c.investment_duration) {
    rows.push(`| **投资期限** | **${c.investment_duration}** |`);
  }
  if (input.principalAmount) {
    rows.push(`| **一次性投入** | **${fmtYuan(input.principalAmount)}** |`);
  }
  if (input.monthlyAmount) {
    rows.push(`| **每月投入** | **${fmtYuan(input.monthlyAmount)}** |`);
  }
  if (c.target_return) {
    rows.push(`| **目标年化收益** | **${c.target_return}%** |`);
  }
  if (c.max_drawdown) {
    rows.push(`| **最大回撤承受** | 约 **${c.max_drawdown}** |`);
  }
  if (c.dca_completion_months) {
    rows.push(`| **定投期限** | **${c.dca_completion_months}** |`);
  }

  return rows.join("\n");
}

export function buildPlanReportMarkdown(input: PlanReportComposeInput): PlanReportComposeResult {
  const profileMetricsInput = {
    sceneName: input.sceneName,
    goalType: input.goalType,
    dateLabel: input.dateLabel,
    ymd: input.ymd,
    basicInfo: input.basicInfo ?? {
      name: "",
      age: 35,
      gender: "",
      has_children: "",
      investment_experience: "",
      financial_assets: 500000,
      monthly_investable: 3500,
      monthly_income_after_tax: 18000,
      monthly_fixed_expense: 8000,
      monthly_loan_payment: 6500,
      marital_status: "",
      occupation: "",
      annual_income_after_tax: 0,
      loan_balance_total: 0,
    },
    constraints: input.constraints,
    principalAmount: input.principalAmount,
    monthlyAmount: input.monthlyAmount,
  };

  const relativeMetrics = deriveRelativeMetrics(profileMetricsInput);

  const periods = parseDeployPeriods(
    input.constraints as unknown as Record<string, unknown>,
    input.principalAmount,
    input.monthlyAmount,
  );
  const totalAmount =
    input.targetAllocation.total_amount_cny ??
    totalDeployAmount(input.principalAmount, input.monthlyAmount, periods);
  const fundCount = input.detailedPlan.categories.reduce(
    (n, c) => n + c.items.length,
    0,
  );
  const weights = pctMap(input.targetAllocation.categories);
  const weightStr = `${weights["股票类"] ?? 0} · ${weights["债券类"] ?? 0} · ${weights["货币类"] ?? 0}`;

  const pieChart = buildCategoryPieChart(input.targetAllocation.categories);
  const echartsBlocks = [pieChart].filter(Boolean) as string[];

  const execBody = buildExecutionSection(input.executionSchedule);

  const md = `# ${input.sceneName}-资产配置方案-${input.ymd}

*为您生成 · ${input.dateLabel}*
*本方案针对 **「${input.sceneName}」** · 数据与公开资讯截至 **${input.asOfDate}***

---

## 个人信息

| 维度 | 您的确认 |
|------|----------|
| **姓名** | ${input.basicInfo?.name ?? "—"} |
| **年龄** | ${input.basicInfo?.age ?? "—"} 岁 |
| **家庭现状** | ${input.basicInfo?.marital_status ?? "—"}${input.basicInfo?.has_children ? `，${input.basicInfo.has_children}` : ""} |
| **职业** | ${input.basicInfo?.occupation ?? "—"} |
| **税后年收入** | ${fmtYuan(input.basicInfo?.annual_income_after_tax ?? 0)} 元 |
| **每月税后到手** | ${fmtYuan(input.basicInfo?.monthly_income_after_tax ?? 0)} 元 |
| **可投资金融资产** | ${fmtYuan(input.basicInfo?.financial_assets ?? 0)} 元 |
| **贷款待还总额** | ${fmtYuan(input.basicInfo?.loan_balance_total ?? 0)} 元 |
| **每月还贷（自付现金）** | ${fmtYuan(input.basicInfo?.monthly_loan_payment ?? 0)} 元 |
| **每月固定生活开支** | ${fmtYuan(input.basicInfo?.monthly_fixed_expense ?? 0)} 元 |
| **每月可投资** | ${fmtYuan(input.basicInfo?.monthly_investable ?? 0)} 元 |

---

## 投资场景需求

| 维度 | 您的确认 |
|------|----------|
${buildScenarioRows(input)}

---

## 大类资产配置

${pieChart}

---

## 配置基金

${buildFundTables(input.detailedPlan.categories)}

---

## 分批建仓计划

${execBody}

**建仓节奏原因：** 分批建仓有助于平滑市场波动风险，避免一次性高位建仓。货币类首期配满锁定流动性，债券类分批小幅加仓兼顾收益与流动性，股票类通过定投分散市场风险。
`;

  return {
    markdown: md,
    echartsCount: echartsBlocks.length,
    relativeMetrics,
    section3Draft: "",
  };
}

export function planReportVerifyWarnings(
  md: string,
  risk: PlanRiskMetrics,
): string[] {
  const warnings: string[] = [];
  if (risk.has_index_data && risk.vol_range !== "—") {
    if (!md.includes(risk.vol_range.replace(/%/g, ""))) {
      warnings.push("§六 年化波动与 deriveRiskMetricsFromIndices 可能不一致。");
    }
  }
  if (/投资规划书/.test(md)) {
    warnings.push("标题应使用「资产配置方案」而非「投资规划书」。");
  }
  return warnings;
}
