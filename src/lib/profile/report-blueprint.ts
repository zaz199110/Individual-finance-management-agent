import { completeText } from "@/lib/llm/invoke";
import { buildModelProbeConfig } from "@/lib/settings/model-probe";
import { ensureModelSlot } from "@/lib/supabase/server";
import type { BasicInfo, InvestmentConstraints } from "./types";

export interface ProfileReportComposeInput {
  sceneName: string;
  goalType: string;
  dateLabel: string;
  ymd: string;
  basicInfo: BasicInfo;
  constraints: InvestmentConstraints;
  principalAmount: number;
  monthlyAmount: number;
}

export interface RelativeMetrics {
  principal_pct_of_assets?: number;
  monthly_pct_of_investable?: number;
  months_to_full_deploy?: number;
  years_to_goal?: number;
  debt_payment_ratio?: number;
  surplus_after_group?: number;
  risk_coherence: string;
}

export interface ProfileReportComposeResult {
  markdown: string;
  echartsCount: number;
  relativeMetrics: RelativeMetrics;
  threeSentencesDraft: string;
  understandingDraft: string;
}

const GOAL_ROLE_SENTENCE: Record<string, string> = {
  retirement: "退休生活 **超长期储备**，退休前原则上不动",
  education: "**阶段性大额** 教育支出准备",
  housing: "**购房/首付** 专项资金",
  marriage_child: "**婚育阶段** 一次性与前期费用准备",
  wealth_growth: "**财富增值**，非应急消费金",
};

function fmtYuan(n: number): string {
  return n.toLocaleString("zh-CN");
}

function fmtPctRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function parsePercentAbs(text: string | number | undefined): number | null {
  if (text == null) return null;
  if (typeof text === "number" && Number.isFinite(text)) return Math.abs(text);
  const m = String(text).match(/-?\s*(\d+(?:\.\d+)?)\s*%/);
  return m ? Math.abs(Number(m[1])) : null;
}

function formatMaxDrawdownInSentence(v: number | string): string {
  const s = String(v).trim();
  if (/^约/.test(s)) return `**${s}** 回撤`;
  return `约 **${s}** 回撤`;
}

export function deriveRelativeMetrics(
  input: ProfileReportComposeInput,
): RelativeMetrics {
  const { basicInfo, constraints, principalAmount, monthlyAmount } =
    input;
  const metrics: RelativeMetrics = {
    risk_coherence: computeRiskCoherence(constraints),
  };

  if (basicInfo.financial_assets > 0 && principalAmount > 0) {
    metrics.principal_pct_of_assets = principalAmount / basicInfo.financial_assets;
  }
  if (basicInfo.monthly_investable > 0 && monthlyAmount > 0) {
    metrics.monthly_pct_of_investable = monthlyAmount / basicInfo.monthly_investable;
  }
  if (
    typeof (constraints as any).deploy_mode === "string" &&
    /定投|分批|每月/.test((constraints as any).deploy_mode as string) &&
    monthlyAmount > 0 &&
    principalAmount > 0
  ) {
    metrics.months_to_full_deploy = Math.ceil(principalAmount / monthlyAmount);
  }
  if (basicInfo.monthly_income_after_tax > 0 && basicInfo.monthly_loan_payment > 0) {
    metrics.debt_payment_ratio =
      basicInfo.monthly_loan_payment / basicInfo.monthly_income_after_tax;
  }
  const surplus =
    basicInfo.monthly_income_after_tax -
    basicInfo.monthly_fixed_expense -
    basicInfo.monthly_loan_payment -
    monthlyAmount;
  if (Number.isFinite(surplus)) {
    metrics.surplus_after_group = surplus;
  }

  return metrics;
}

function computeRiskCoherence(c: InvestmentConstraints): string {
  const drawdown = parsePercentAbs(c.max_drawdown) ?? 15;
  const rawReturn = (c as any).target_return ?? (c as any).expected_return;
  const expected =
    typeof rawReturn === "number"
      ? rawReturn
      : parsePercentAbs(rawReturn) ?? 5;
  const risk = c.risk_tolerance;

  if (/保守/.test(risk) && (expected >= 8 || drawdown >= 25)) {
    return "边界偏紧，建议后续配置讨论对齐";
  }
  if (/进取|积极/.test(risk) || expected > drawdown * 0.5 + 5) {
    return "偏进取，需留意波动";
  }
  if (/稳健|保守/.test(risk) && drawdown <= 15 && expected <= 6) {
    return "三者大致匹配";
  }
  if (/平衡/.test(risk) && drawdown <= 20 && expected <= 10) {
    return "三者大致匹配";
  }
  return "需在后续配置中留意边界";
}

function formatExpectedReturn(v: number | string): string {
  if (typeof v === "number") return `约 ${v}%`;
  const s = String(v).trim();
  return s.includes("%") ? s : `约 ${s}%`;
}

export function buildThreeSentencesDraft(
  input: ProfileReportComposeInput,
  metrics: RelativeMetrics,
): string {
  const { goalType, constraints, principalAmount, monthlyAmount } =
    input;
  const role = GOAL_ROLE_SENTENCE[goalType] ?? "专项储备";

  const rel3: string[] = [];
  if (metrics.monthly_pct_of_investable != null && monthlyAmount > 0) {
    rel3.push(`月投约占月可投 **${fmtPctRatio(metrics.monthly_pct_of_investable)}**`);
  }
  if (metrics.months_to_full_deploy != null) {
    rel3.push(`按当前节奏约 **${metrics.months_to_full_deploy} 个月** 投完本组计划`);
  }
  if (metrics.surplus_after_group != null && metrics.surplus_after_group >= 0) {
    rel3.push(`本组外月结余约 **${fmtYuan(metrics.surplus_after_group)} 元**`);
  }

  const line2 = `自评 **${constraints.risk_tolerance}**，最多${formatMaxDrawdownInSentence(constraints.max_drawdown)}、预期年化 **${formatExpectedReturn((constraints as any).target_return ?? (constraints as any).expected_return ?? 0)}**——${metrics.risk_coherence}。`;

  const line3 = [
    `本组 **已有 ${fmtYuan(principalAmount)} 元**`,
    monthlyAmount > 0 ? `每月 **再投 ${fmtYuan(monthlyAmount)} 元**（${(constraints as any).deploy_mode ?? "未知"}）` : `投入方式：**${(constraints as any).deploy_mode ?? "未知"}**`,
    rel3[0] ?? "",
  ]
    .filter(Boolean)
    .join("；");

  return [
    `> **① 风险偏好：** ${line2}`,
    `> **② 执行节奏：** ${line3}。`,
  ].join("\n");
}

export function buildUnderstandingDraft(
  input: ProfileReportComposeInput,
  metrics: RelativeMetrics,
): string {
  const { sceneName, goalType, constraints, principalAmount, monthlyAmount, basicInfo } =
    input;
  const role = GOAL_ROLE_SENTENCE[goalType] ?? "专项储备";
  const bullets: string[] = [];

  bullets.push(
    `**1. 本组角色** 您把本组定位为 **「${sceneName}」**：${role.replace(/\*\*/g, "")}。结合 **${(constraints as any).investment_duration ?? (constraints as any).investment_horizon ?? "未知"}** 期限，${(constraints as any).liquidity_need ?? "暂未提供"}。`,
  );

  bullets.push(
    `**2. 风险自洽** **${constraints.risk_tolerance}** + **${constraints.max_drawdown}** + **${formatExpectedReturn((constraints as any).target_return ?? (constraints as any).expected_return ?? 0)}** 预期——${metrics.risk_coherence}；后续配置讨论应默认 **控波动优先**。`,
  );

  const fundParts: string[] = [
    `本组 **${fmtYuan(principalAmount)} 元**`,
    monthlyAmount > 0 ? `月投 **${fmtYuan(monthlyAmount)} 元**` : "",
  ].filter(Boolean);
  const vsParts: string[] = [];
  if (metrics.monthly_pct_of_investable != null && monthlyAmount > 0) {
    vsParts.push(`占客户信息层月可投 **${fmtPctRatio(metrics.monthly_pct_of_investable)}**`);
  }
  if (metrics.principal_pct_of_assets != null) {
    vsParts.push(`约占可投资金融资产 **${fmtPctRatio(metrics.principal_pct_of_assets)}**`);
  }
  bullets.push(
    `**3. 资金与执行** ${fundParts.join("、")}${vsParts.length ? `，${vsParts.join("、")}` : ""}。${metrics.surplus_after_group != null && metrics.surplus_after_group < 1000 ? "本组外月结余偏紧，**不宜** 在本组外重复占用同一笔结余。" : "与整体财务能力 **大致匹配**。"}`,
  );

  if ((constraints as any).liquidity_need) {
    bullets.push(
      `**4. 流动性** 您确认 **${(constraints as any).liquidity_need}**——这意味着持有期与波动承受须与动用计划 **一致**（仍 **不** 点名具体产品）。`,
    );
  }

  return bullets.join("\n\n");
}

function buildOverviewTable(input: ProfileReportComposeInput): string {
  const { sceneName, constraints, principalAmount, monthlyAmount } =
    input;
  const rows = [
    ["**投资目标**", `**${sceneName}**`],
    ["**投资期限**", (constraints as any).investment_duration ?? (constraints as any).investment_horizon ?? "未知"],
    ["**风险偏好**", constraints.risk_tolerance],
    ["**最多能接受回撤**", constraints.max_drawdown],
    ["**期望年化收益**", `${formatExpectedReturn((constraints as any).target_return ?? (constraints as any).expected_return ?? 0)}（心理预期，非承诺）`],
    ["**何时可能动用**", (constraints as any).liquidity_need ?? "暂未提供"],
    ["**这一组已有金额**", `**${fmtYuan(principalAmount)} 元**`],
    ["**这一组每月再投入**", `**${fmtYuan(monthlyAmount)} 元**`],
    ["**投资范围**", "中国公募基金"],
  ];
  return [
    "| 维度 | 您的确认 |",
    "|------|----------|",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join("\n");
}

export function buildBasicInfoSection(
  basicInfo: BasicInfo,
  _totalMonthlyInvest = 0,
): string {
  const b = basicInfo;
  const annualWan = b.annual_income_after_tax > 0
    ? `${(b.annual_income_after_tax / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万元`
    : "—";
  const assetsWan = b.financial_assets > 0
    ? `${(b.financial_assets / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万元`
    : "—";
  const loanWan = b.loan_balance_total > 0
    ? `${(b.loan_balance_total / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万元`
    : "—";

  const pieChart = buildMonthlyCashflowChart(basicInfo, _totalMonthlyInvest);

  return `## 1 基础信息

### 个人资料

| 项目 | 内容 |
|------|------|
| 姓名 | ${b.name} |
| 年龄 | ${b.age} |
| 性别 | ${b.gender} |
| 婚姻状况 | ${b.marital_status} |
| 子女情况 | ${b.has_children} |
| 职业 | ${b.occupation} |
| 投资经验 | ${b.investment_experience} |

### 收支概况

| 项目 | 内容 |
|------|------|
| 税后年收入 | ${annualWan} |
| 每月税后到手 | ${fmtYuan(b.monthly_income_after_tax)} |
| 每月固定生活开支 | ${fmtYuan(b.monthly_fixed_expense)} |
| 每月可投资 | ${fmtYuan(b.monthly_investable)} |

### 资产与负债

| 项目 | 内容 |
|------|------|
| 可投资金融资产 | ${assetsWan} |
| 贷款待还总额 | ${loanWan} |
| 每月还贷 | ${fmtYuan(b.monthly_loan_payment)} |

${pieChart}`;
}

export function buildMonthlyCashflowChart(
  basicInfo: BasicInfo,
  totalMonthlyInvest = 0,
): string {
  const b = basicInfo;
  const fixed = b.monthly_fixed_expense;
  const loan = b.monthly_loan_payment;
  const invest = totalMonthlyInvest;
  const other = b.monthly_income_after_tax - fixed - loan - invest;

  const total = fixed + loan + invest + other;
  const fixedPct = total > 0 ? Math.round((fixed / total) * 100) : 0;
  const loanPct = total > 0 ? Math.round((loan / total) * 100) : 0;
  const investPct = total > 0 ? Math.round((invest / total) * 100) : 0;
  const otherPct = total > 0 ? Math.round((other / total) * 100) : 0;

  const table = `| 类别           | 月均金额(元) | 占比 |
|----------------|-------------|------|
| 固定生活开支    | ${fmtYuan(fixed)} | ${fixedPct}% |
| 每月还贷       | ${fmtYuan(loan)} | ${loanPct}% |
| 每月再投资金额  | ${fmtYuan(invest)} | ${investPct}% |
| 其他用途       | ${fmtYuan(other)} | ${otherPct}% |`;

  const option = {
    title: {
      text: "每月现金流分配",
      subtext: "各分类占每月总收入的占比",
      left: "center",
      textStyle: { fontSize: 16, fontWeight: 600, color: "#1e293b" },
      subtextStyle: { fontSize: 11, color: "#64748b" },
    },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c}元 ({d}%)",
    },
    legend: {
      orient: "horizontal",
      bottom: 0,
      data: ["固定生活开支", "每月还贷", "每月再投资金额", "其他用途"],
    },
    series: [
      {
        name: "每月现金流分配",
        type: "pie",
        radius: "50%",
        data: [
          { value: fixed, name: "固定生活开支" },
          { value: loan, name: "每月还贷" },
          { value: invest, name: "每月再投资金额" },
          { value: other, name: "其他用途" },
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };

  const chart = "```echarts\n" + JSON.stringify(option, null, 2) + "\n```";

  return `### 1.1 每月现金流分配

${table}

${chart}`;
}

export function buildGoalTimelineChart(
  input: ProfileReportComposeInput,
  metrics: RelativeMetrics,
): string | null {
  if (metrics.years_to_goal == null || metrics.years_to_goal <= 0) return null;
  const labels = ["现在", `约 ${metrics.years_to_goal} 年后`];
  const option = {
    title: {
      text: "目标时间线",
      subtext: "按您确认的时间口径 · 示意",
      left: "center",
      textStyle: { fontSize: 16, fontWeight: 600, color: "#1e293b" },
      subtextStyle: { fontSize: 11, color: "#64748b" },
    },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value", show: false },
    color: ["#22c55e"],
    series: [
      {
        type: "bar",
        data: [0, metrics.years_to_goal],
        barWidth: "40%",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
  return "```echarts\n" + JSON.stringify(option, null, 2) + "\n```";
}

function extractGoalAmount(
  constraints: InvestmentConstraints,
): string {
  const ta = (constraints as any).target_amount;
  if (typeof ta === "number" && ta > 0) {
    return `${(ta / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万元`;
  }
  return "—";
}

function computeInvestmentDuration(constraints: InvestmentConstraints): string {
  const dur = (constraints as any).investment_duration ?? (constraints as any).investment_horizon;
  if (dur) return String(dur);
  const startDate = (constraints as any).start_invest_date;
  const endDate =
    (constraints as any).money_needed_date ??
    (constraints as any).money_needed_start_date;
  if (startDate && endDate) {
    const start = new Date(startDate as string).getTime();
    const end = new Date(endDate as string).getTime();
    const diffMs = end - start;
    if (diffMs > 0) {
      const years = diffMs / (365.25 * 24 * 60 * 60 * 1000);
      if (years < 1) return `${Math.round(years * 12)}个月`;
      return `${years.toFixed(1)}年`;
    }
  }
  return "—";
}

export function buildGoalScenarioTable(
  goalType: string,
  constraints: InvestmentConstraints,
  displayName: string,
  principalAmount: number,
  monthlyAmount: number,
  sectionNumber: string = "",
): string {
  const c = constraints as any;

  const commonRows: Array<[string, string]> = [
    ["风险偏好", c.risk_tolerance ?? "—"],
    ["最大回撤承受", c.max_drawdown ?? "—"],
    ["目标年化收益", `${c.target_return ?? c.expected_return ?? "—"}%`],
    ["一次性投入", `${fmtYuan(principalAmount)}`],
    ["每月投入", `${fmtYuan(monthlyAmount)}`],
    ["定投期限", c.dca_completion_months ?? "—"],
  ];

  const specificRows: Array<[string, string]> = [];
  if (goalType === "marriage_child") {
    specificRows.push(
      ["计划开始日期", c.start_invest_date ?? "—"],
      ["资金需求日期", c.money_needed_date ?? "—"],
      ["目标金额", extractGoalAmount(constraints)],
    );
  } else if (goalType === "education") {
    specificRows.push(
      ["计划开始日期", c.start_invest_date ?? "—"],
      ["资金需求日期", c.money_needed_date ?? "—"],
    );
  } else if (goalType === "housing") {
    specificRows.push(
      ["计划开始日期", c.start_invest_date ?? "—"],
      ["资金需求日期", c.money_needed_date ?? "—"],
    );
  } else if (goalType === "retirement") {
    specificRows.push(
      ["计划开始日期", c.start_invest_date ?? "—"],
      ["资金需求日期", c.money_needed_date ?? "—"],
      ["每月退休生活支出", c.monthly_retirement_spending
        ? `${fmtYuan(Number(c.monthly_retirement_spending))}`
        : "—"],
    );
  } else if (goalType === "wealth_growth") {
    specificRows.push(["投资期限", computeInvestmentDuration(constraints)]);
  }

  const allRows = [...commonRows, ...specificRows];
  const lines = [
    `### ${sectionNumber} ${displayName}`,
    "",
    "| 项目 | 内容 |",
    "|------|------|",
    ...allRows.map(([k, v]) => `| ${k} | ${v} |`),
  ];
  return lines.join("\n");
}

export function buildAiAdviceDraft(
  basicInfo: BasicInfo,
  scenarios: Array<Record<string, unknown>>,
): string {
  const count = scenarios.length;
  let totalMonthly = 0;
  const riskTolerances: string[] = [];
  for (const s of scenarios) {
    const ma = Number(s.monthlyAmount) || Number(s.monthly_amount) || 0;
    totalMonthly += ma;
    const constraints = (s as any).constraints ?? s;
    const rt = constraints?.risk_tolerance ?? s.risk_tolerance ?? "—";
    riskTolerances.push(String(rt));
  }

  const monthlyInvestable = Number(basicInfo.monthly_investable) || 0;
  const assets = Number(basicInfo.financial_assets) || 0;

  // 1. 资金画像
  let angle1 = "";
  if (monthlyInvestable > 0) {
    angle1 = `月可投${(monthlyInvestable / 10000).toFixed(1)}万元，金融资产${(assets / 10000).toFixed(1)}万元，`;
    if (totalMonthly > 0 && totalMonthly <= monthlyInvestable) {
      angle1 += `月投资计划${(totalMonthly / 10000).toFixed(1)}万元在可投范围内。`;
    } else if (totalMonthly > monthlyInvestable) {
      angle1 += `月投资计划${(totalMonthly / 10000).toFixed(1)}万元超出月可投${(monthlyInvestable / 10000).toFixed(1)}万元，需留意资金安排。`;
    } else {
      angle1 += "资金安排需结合具体目标评估。";
    }
  } else {
    angle1 = "请完善月可投金额信息后评估资金画像。";
  }

  // 2. 目标协同
  let angle2 = "";
  if (count <= 1) {
    angle2 = "当前仅有单一目标，暂无跨目标协同需求。";
  } else {
    angle2 = `共${count}个投资目标，建议按周期长短分优先级，避免短期目标挤占长期储备。`;
  }

  // 3. 风险匹配
  let angle3 = "";
  const uniqueRisks = [...new Set(riskTolerances)];
  if (uniqueRisks.length === 1) {
    angle3 = `各目标风险偏好一致（${uniqueRisks[0]}），投资策略可整体对齐。`;
  } else if (uniqueRisks.length > 1) {
    angle3 = `各目标风险偏好不一（${uniqueRisks.join("、")}），建议按各自期限独立配置。`;
  } else {
    angle3 = "请完善风险偏好信息。";
  }

  // 4. 执行可行性
  let angle4 = "";
  if (monthlyInvestable > 0 && totalMonthly > 0) {
    const ratio = totalMonthly / monthlyInvestable;
    if (ratio <= 0.8) {
      angle4 = `月投资合计${(totalMonthly / 10000).toFixed(1)}万元，占月可投${Math.round(ratio * 100)}%，执行空间充裕。`;
    } else if (ratio <= 1.0) {
      angle4 = `月投资合计${(totalMonthly / 10000).toFixed(1)}万元，占月可投${Math.round(ratio * 100)}%，接近上限，建议预留缓冲。`;
    } else {
      angle4 = `月投资合计超出月可投能力，建议调整部分目标的投入节奏。`;
    }
  } else {
    angle4 = "请完善月投资计划后评估执行可行性。";
  }

  return `## 3 AI建议

**1. 资金画像**：${angle1}

**2. 目标协同**：${angle2}

**3. 风险匹配**：${angle3}

**4. 执行可行性**：${angle4}`;
}

export function buildAiAdviceSection(
  basicInfo: BasicInfo,
  scenarios: Array<Record<string, unknown>>,
): string {
  return buildAiAdviceDraft(basicInfo, scenarios);
}

export function buildProfileReportMarkdown(
  input: ProfileReportComposeInput,
): ProfileReportComposeResult {
  const metrics = deriveRelativeMetrics(input);
  const threeSentencesDraft = buildThreeSentencesDraft(input, metrics);
  const understandingDraft = buildUnderstandingDraft(input, metrics);

  const scenarioTable = buildGoalScenarioTable(
    input.goalType,
    input.constraints,
    input.sceneName,
    input.principalAmount,
    input.monthlyAmount,
    "2.1",
  );

  const aiAdvice = buildAiAdviceDraft(input.basicInfo, [
    {
      goal_type: input.goalType,
      display_name: input.sceneName,
      constraints: input.constraints,
      monthlyAmount: input.monthlyAmount,
      principalAmount: input.principalAmount,
    },
  ]);

  const md = `# 投资需求-${input.ymd}

${buildBasicInfoSection(input.basicInfo, input.monthlyAmount)}

## 2 投资场景

${scenarioTable}

---

${aiAdvice}

---

## 4 合规提示

> 本报告由AI基于您提供的信息生成，仅供参考，不构成投资建议。
`;

  return {
    markdown: md,
    echartsCount: 0,
    relativeMetrics: metrics,
    threeSentencesDraft,
    understandingDraft,
  };
}

/** Verify 辅助：basic_info 完整标签（截图 14 项） */
export const BASIC_INFO_LABELS = [
  // 个人资料
  "姓名",
  "年龄",
  "性别",
  "婚姻状况",
  "子女情况",
  "职业",
  "投资经验",
  // 收支概况
  "税后年收入",
  "每月税后到手",
  "每月固定生活开支",
  "每月可投资",
  // 资产与负债
  "可投资金融资产",
  "贷款待还总额",
  "每月还贷",
] as const;

/** @deprecated Use buildAiAdviceDraft instead. Kept for backward compatibility. */
export const buildCrossScenarioSummary = buildAiAdviceDraft;
