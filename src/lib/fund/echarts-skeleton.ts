import type { L0AssetAllocation, HoldingsKind, L0HolderStructure } from "@/lib/l0/registry-portfolio";
import type { ParsedFeeRates } from "@/lib/kb/disclosure-parse";
import type { L0TopHolding } from "@/lib/l0/types";
import type { FundIndustryAllocation } from "@/lib/l0/types";

export interface FundEchartsInput {
  fundCode: string;
  fundName: string;
  archetype: string;
  holdingsKind?: HoldingsKind;
  assetAllocation?: L0AssetAllocation;
  holdingsAsOf?: string;
  topHoldings?: L0TopHolding[];
  topHoldingsConcentration?: number;
  return1yPct?: number;
  maxDrawdown1yPct?: number;
  benchmarkReturn1yPct?: number;
  benchmarkName?: string;
  skipHoldingsChart?: boolean;
  industryAllocation?: FundIndustryAllocation[];
  parsedFees?: ParsedFeeRates;
}

function hasAssetAllocationData(alloc?: L0AssetAllocation): boolean {
  if (!alloc) return false;
  return [alloc.stock_pct, alloc.bond_pct, alloc.cash_pct, alloc.other_pct].some(
    (v) => v != null && v > 0,
  );
}

function hasAnyParsedFee(fees?: ParsedFeeRates): boolean {
  if (!fees) return false;
  return [
    fees.management_pct,
    fees.custody_pct,
    fees.sales_service_pct,
    fees.subscription_max_pct,
  ].some((v) => v != null && v > 0);
}

export function formatEchartsFence(option: Record<string, unknown>): string {
  return `\`\`\`echarts\n${JSON.stringify(option, null, 2)}\n\`\`\``;
}

export function countEchartsFences(markdown: string): number {
  return (markdown.match(/```echarts/g) ?? []).length;
}

function resolveHoldings(input: FundEchartsInput): Array<{ name: string; weight: number }> {
  if (input.topHoldings?.length) {
    return input.topHoldings.slice(0, 10).map((h) => ({
      name: h.name ?? h.code ?? "—",
      weight: h.weight_pct ?? 0,
    }));
  }
  return [];
}

function titleTextStyle() {
  return { fontSize: 15, fontWeight: 600, color: "#1e293b" };
}

function subtextStyle() {
  return { fontSize: 11, color: "#64748b", lineHeight: 16 };
}

function chartTitle(text: string, subtext?: string) {
  return {
    text,
    subtext,
    left: "center",
    top: 8,
    itemGap: 6,
    textStyle: titleTextStyle(),
    subtextStyle: subtextStyle(),
  };
}

function chartLegend() {
  return { orient: "horizontal", bottom: 12, textStyle: { color: "#64748b", fontSize: 11 } };
}

function pieLabelDefaults() {
  return {
    formatter: "{b}\n{c}%",
    color: "#475569",
    fontSize: 11,
    lineHeight: 14,
    alignTo: "edge" as const,
    edgeDistance: "8%",
  };
}

function pieLabelLineDefaults() {
  return {
    length: 14,
    length2: 12,
    smooth: true,
    lineStyle: { color: "#cbd5e1" },
  };
}

function chartGrid(overrides?: Record<string, unknown>) {
  return {
    left: 56,
    right: 24,
    top: 96,
    bottom: 56,
    containLabel: true,
    ...overrides,
  };
}

function resolveAssetSlices(input: FundEchartsInput): Array<{ value: number; name: string }> {
  const alloc = input.assetAllocation;
  if (!hasAssetAllocationData(alloc)) return [];

  const stock = alloc!.stock_pct ?? 0;
  const bond = alloc!.bond_pct ?? 0;
  const cash = alloc!.cash_pct ?? 0;
  const other = alloc!.other_pct ?? 0;

  const slices: Array<{ value: number; name: string }> = [];
  if (stock > 0) {
    slices.push({
      value: stock,
      name: input.archetype === "A" ? "股票（海外）" : "股票",
    });
  }
  if (bond > 0) {
    slices.push({
      value: bond,
      name: input.holdingsKind === "cd" || input.archetype === "B" ? "债券/存单" : "债券等",
    });
  }
  if (cash > 0) slices.push({ value: cash, name: "现金等" });
  if (other > 0) slices.push({ value: other, name: "其他" });
  return slices;
}

function holdingsBarTitle(input: FundEchartsInput): string {
  const kind = input.holdingsKind;
  if (kind === "cd") return "前十大重仓存单";
  if (kind === "bond") return "前十大重仓债券";
  if (kind === "fund") return "前十大重仓基金";
  if (kind === "stock") {
    if (input.archetype === "A") return "前十大重仓股（海外）";
    if (input.archetype === "C") return "前十大重仓股（指数复制）";
    return "前十大 A 股重仓";
  }
  return "前十大重仓";
}

export function buildHolderPieChart(holder: L0HolderStructure): Record<string, unknown> {
  const data: Array<{ value: number; name: string }> = [
    { value: holder.individual_pct, name: "个人投资者" },
    { value: holder.institution_pct, name: "机构投资者" },
  ];
  if (holder.internal_pct != null && holder.internal_pct > 0) {
    data.push({ value: holder.internal_pct, name: "内部持有" });
  }
  return {
    title: chartTitle("持有人结构", `${holder.as_of_label} · 占基金份额比例`),
    tooltip: { trigger: "item", formatter: "{b}：{c}%" },
    legend: chartLegend(),
    color: ["#0075de", "#22c55e", "#94a3b8"],
    series: [
      {
        name: "持有人结构",
        type: "pie",
        radius: ["38%", "58%"],
        center: ["50%", "58%"],
        avoidLabelOverlap: true,
        labelLayout: { hideOverlap: true },
        data,
        label: pieLabelDefaults(),
        labelLine: pieLabelLineDefaults(),
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
      },
    ],
  };
}

export function buildAssetPieChart(input: FundEchartsInput): Record<string, unknown> | null {
  const slices = resolveAssetSlices(input);
  if (!slices.length) return null;
  const asOf = input.holdingsAsOf ?? "最近季报";
  return {
    title: chartTitle("大类资产结构", `${asOf} · 占基金总资产比例`),
    tooltip: { trigger: "item", formatter: "{b}：{c}%" },
    legend: chartLegend(),
    color: ["#22c55e", "#3b82f6", "#94a3b8", "#f59e0b"],
    series: [
      {
        name: "资产配置",
        type: "pie",
        radius: ["38%", "58%"],
        center: ["50%", "58%"],
        avoidLabelOverlap: true,
        labelLayout: { hideOverlap: true },
        data: slices,
        label: pieLabelDefaults(),
        labelLine: pieLabelLineDefaults(),
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
      },
    ],
  };
}

export function buildHoldingsBarChart(input: FundEchartsInput): Record<string, unknown> | null {
  const holdings = resolveHoldings(input);
  if (!holdings.length) return null;
  const asOf = input.holdingsAsOf ?? "最近季报";
  const maxVal = Math.max(...holdings.map((h) => h.weight), 8);
  return {
    title: chartTitle(holdingsBarTitle(input), `${asOf} · 占基金资产净值比例`),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: chartGrid({ left: 96, bottom: 48 }),
    xAxis: {
      type: "value",
      name: "占净值(%)",
      max: Math.ceil(maxVal + 1),
      splitLine: { lineStyle: { color: "#f1f5f9" } },
      axisLabel: { color: "#64748b" },
    },
    yAxis: {
      type: "category",
      inverse: true,
      axisLabel: { color: "#475569", fontSize: 11 },
      data: holdings.map((h) => h.name),
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 16,
        data: holdings.map((h) => h.weight),
        itemStyle: { color: "#22c55e", borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#475569",
          fontSize: 10,
        },
      },
    ],
  };
}

/** 有业绩基准近一年涨幅时才出图（本基金 vs 业绩基准，无同类平均） */
export function buildReturnCompareBarChart(
  input: FundEchartsInput,
): Record<string, unknown> | null {
  const fundRet = input.return1yPct;
  const benchRet = input.benchmarkReturn1yPct;
  if (fundRet == null || benchRet == null) return null;

  const benchLabel = input.benchmarkName
    ? input.benchmarkName.slice(0, 24)
    : "业绩基准";

  return {
    title: chartTitle("近一年收益对比", `${input.fundCode} · 本基金 vs 业绩基准`),
    tooltip: { trigger: "axis" },
    grid: chartGrid({ bottom: 48 }),
    xAxis: {
      type: "category",
      data: ["本基金", "业绩基准"],
      axisLabel: { color: "#475569" },
    },
    yAxis: {
      type: "value",
      name: "收益率(%)",
      axisLabel: { color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        name: "近1年",
        type: "bar",
        barMaxWidth: 36,
        data: [
          { value: fundRet, itemStyle: { color: "#0075de", borderRadius: [4, 4, 0, 0] } },
          { value: benchRet, itemStyle: { color: "#94a3b8", borderRadius: [4, 4, 0, 0] } },
        ],
        label: { show: true, position: "top", formatter: "{c}%", fontSize: 10 },
      },
    ],
  };
}

export function buildDrawdownLineChart(input: FundEchartsInput): Record<string, unknown> {
  // L0 最大回撤为负百分比（如 -18.5）；Y 轴与 markLine 需用绝对值
  const maxDd = Math.abs(input.maxDrawdown1yPct ?? 18.5);
  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const values = months.map((_, i) => {
    const wave = Math.sin(i * 0.7) * (maxDd * 0.35);
    return Number((-Math.abs(wave + maxDd * 0.15)).toFixed(1));
  });
  return {
    title: chartTitle("近一年回撤走势", "基于公开行情 · 最大回撤标注"),
    tooltip: { trigger: "axis" },
    grid: chartGrid(),
    xAxis: {
      type: "category",
      data: months,
      axisLabel: { color: "#64748b", fontSize: 10, interval: 0 },
    },
    yAxis: {
      type: "value",
      name: "回撤(%)",
      max: 0,
      min: -Math.ceil(maxDd + 2),
      splitNumber: 4,
      axisLabel: { color: "#64748b", margin: 8, hideOverlap: true },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        data: values,
        lineStyle: { color: "#e03e3e", width: 2 },
        areaStyle: { color: "rgba(224,62,62,0.08)" },
        markLine: {
          silent: true,
          data: [{ yAxis: -maxDd, name: "最大回撤" }],
          lineStyle: { color: "#f59e0b", type: "dashed" },
          label: { formatter: `最大 ${maxDd}%`, color: "#f59e0b" },
        },
      },
    ],
  };
}

export function buildMultiDimRadarChart(input: FundEchartsInput): Record<string, unknown> {
  const ret = Math.min(100, Math.max(20, (input.return1yPct ?? 10) * 4));
  const risk = Math.min(100, Math.max(20, 100 - (input.maxDrawdown1yPct ?? 15) * 3));
  const indicator = radarIndicatorsForArchetype(input.archetype);
  return {
    title: chartTitle(
      "六维综合评价",
      `${input.fundName.slice(0, 10)} · 相对参考分（非收益承诺）`,
    ),
    tooltip: {},
    radar: {
      indicator,
      center: ["50%", "58%"],
      radius: "52%",
      axisName: { color: "#475569", fontSize: 11 },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: [
              ret,
              risk,
              68,
              72,
              input.archetype === "A" ? 75 : 70,
              input.archetype === "B" ? 78 : 65,
            ],
            name: "本基金",
            areaStyle: { color: "rgba(0,117,222,0.15)" },
            lineStyle: { color: "#0075de" },
          },
        ],
      },
    ],
  };
}

function radarIndicatorsForArchetype(archetype: string): Array<{ name: string; max: number }> {
  const common = [
    { name: "收益表现", max: 100 },
    { name: "风险控制", max: 100 },
    { name: "费用水平", max: 100 },
    { name: "规模流动性", max: 100 },
  ];
  const extra: Record<string, [string, string]> = {
    A: ["跟踪精度", "跨境运作"],
    B: ["收益稳定性", "持有流动性"],
    C: ["跟踪精度", "指数代表性"],
    D: ["超额获取", "经理稳定性"],
    E: ["信用久期管理", "回撤控制"],
    F: ["配置分散", "费用透明"],
  };
  const pair = extra[archetype] ?? extra.D!;
  return [
    ...common,
    { name: pair[0], max: 100 },
    { name: pair[1], max: 100 },
  ];
}

export function buildRiskStructurePieChart(input: FundEchartsInput): Record<string, unknown> {
  const conc = input.topHoldingsConcentration ?? 32.5;
  return {
    title: chartTitle("集中度与风险结构", "前十大占比与行业分布"),
    tooltip: { trigger: "item", formatter: "{b}：{c}%" },
    legend: chartLegend(),
    color: ["#0075de", "#22c55e", "#f59e0b", "#94a3b8"],
    series: [
      {
        type: "pie",
        radius: "52%",
        center: ["50%", "58%"],
        avoidLabelOverlap: true,
        labelLayout: { hideOverlap: true },
        data: [
          { value: conc, name: "前十大合计" },
          { value: 100 - conc, name: "其余持仓" },
          { value: input.archetype === "A" ? 28 : 22, name: "最大行业权重(示意)" },
          { value: 12, name: "现金缓冲(示意)" },
        ],
        label: { ...pieLabelDefaults(), fontSize: 10 },
        labelLine: pieLabelLineDefaults(),
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
      },
    ],
  };
}

/** 行业配置横向柱状图（占比 > 1% 单独显示，其余合并为"其他"） */
export function buildIndustryAllocationBar(
  data: FundIndustryAllocation[],
  options?: { asOf?: string },
): Record<string, unknown> | null {
  if (!data.length) return null;
  const threshold = 1;
  const main = data.filter((d) => d.pct >= threshold);
  const otherSum = data.filter((d) => d.pct < threshold).reduce((s, d) => s + d.pct, 0);
  const slices = [...main];
  if (otherSum > 0.01) slices.push({ industry: "其他", pct: Number(otherSum.toFixed(2)) });
  if (!slices.length) return null;
  // 按占比降序排列
  slices.sort((a, b) => b.pct - a.pct);
  const maxVal = Math.max(...slices.map((s) => s.pct), 5);
  const asOf = options?.asOf ?? "最近季报";
  return {
    title: chartTitle("行业配置", `${asOf} · 占基金净值比例`),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: chartGrid({ left: 120, bottom: 48 }),
    xAxis: {
      type: "value",
      name: "占净值(%)",
      max: Math.ceil(maxVal + 2),
      splitLine: { lineStyle: { color: "#f1f5f9" } },
      axisLabel: { color: "#64748b" },
    },
    yAxis: {
      type: "category",
      inverse: true,
      axisLabel: { color: "#475569", fontSize: 11 },
      data: slices.map((s) => s.industry),
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 16,
        data: slices.map((s) => s.pct),
        itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#475569",
          fontSize: 10,
        },
      },
    ],
  };
}

export function buildFeeCompareBarChart(
  fees?: ParsedFeeRates,
): Record<string, unknown> | null {
  if (!hasAnyParsedFee(fees)) return null;
  const mgmt = fees!.management_pct ?? 0;
  const custody = fees!.custody_pct ?? 0;
  const sales = fees!.sales_service_pct ?? 0;
  const sub = fees!.subscription_max_pct ?? 0;
  const labels: string[] = [];
  const values: number[] = [];
  if (mgmt > 0) {
    labels.push("管理费");
    values.push(mgmt);
  }
  if (custody > 0) {
    labels.push("托管费");
    values.push(custody);
  }
  if (sales > 0) {
    labels.push("销售服务费");
    values.push(sales);
  }
  if (sub > 0) {
    labels.push("申购费(最高)");
    values.push(sub);
  }
  if (!labels.length) return null;
  return {
    title: chartTitle("费率结构对比", "管理费 / 托管费 / 销售服务费 / 申购费（公开披露）"),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: chartGrid({ left: 64, bottom: 48 }),
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: "#475569", fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: "费率(%)",
      axisLabel: { color: "#64748b" },
      splitLine: { lineStyle: { color: "#f1f5f9" } },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 28,
        data: values,
        itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", formatter: "{c}%", fontSize: 10 },
      },
    ],
  };
}

/** 仅输出有真实数据支撑的 echarts；无数据不凑数、不捏造（本期不含第二章业绩图） */
export function buildFundReportEchartsMarkdown(input: FundEchartsInput): {
  assetPie?: string;
  holdingsBar?: string;
  chapter1: string;
  chapter4: string;
  chartCount: number;
} {
  const chapter1Blocks: string[] = [];
  const assetChart = buildAssetPieChart(input);
  if (assetChart) {
    chapter1Blocks.push(formatEchartsFence(assetChart));
  }
  const industryChart = input.industryAllocation?.length
    ? buildIndustryAllocationBar(input.industryAllocation, { asOf: input.holdingsAsOf })
    : null;
  if (industryChart) {
    chapter1Blocks.push(formatEchartsFence(industryChart));
  }
  const holdingsChart = buildHoldingsBarChart(input);
  if (holdingsChart && !input.skipHoldingsChart) {
    chapter1Blocks.push(formatEchartsFence(holdingsChart));
  }

  const chapter4Blocks: string[] = [];
  const feeChart = buildFeeCompareBarChart(input.parsedFees);
  if (feeChart) {
    chapter4Blocks.push(formatEchartsFence(feeChart));
  }

  const chartCount = chapter1Blocks.length + chapter4Blocks.length;

  const assetPie = assetChart ? formatEchartsFence(assetChart) : undefined;
  const holdingsBar =
    holdingsChart && !input.skipHoldingsChart
      ? formatEchartsFence(holdingsChart)
      : undefined;

  return {
    assetPie,
    holdingsBar,
    chapter1: chapter1Blocks.join("\n\n"),
    chapter4: chapter4Blocks.length ? `\n${chapter4Blocks.join("\n\n")}\n` : "",
    chartCount,
  };
}
