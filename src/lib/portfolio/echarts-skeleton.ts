/**
 * echarts-skeleton.ts · 持仓分析报告图表 JSON 生成
 *
 * 职责：生成 §二 横条图、§三 环图、§五 柱图 的 echarts JSON
 * 参考：requirement/docs/samples/portfolio-analysis-report-sample-variant-a.md
 */

import type { PortfolioPositionMetrics } from "./holdings-nav-gather";
import type { CategorySlice } from "./category-map";

// ─── 图表接口 ────────────────────────────────────────────────────────────────

export interface EchartsConfig {
  /** 图表标题 */
  title: string;
  /** 图表副标题 */
  subtext: string;
  /** echarts option JSON（不含 markdown 包裹） */
  option: Record<string, unknown>;
}

// ─── 颜色常量 ────────────────────────────────────────────────────────────────

const COLORS = {
  green: "#22c55e",
  greenLight: "#86efac",
  greenDark: "#16a34a",
  greenDarkLight: "#4ade80",
  blue: "#3b82f6",
  blueLight: "#93c5fd",
  gray: "#64748b",
  grayLight: "#cbd5e1",
  grayDark: "#94a3b8",
  text: "#1e293b",
  textSecondary: "#64748b",
  textDark: "#334155",
  textMuted: "#475569",
  border: "#e2e8f0",
  bgLight: "#f1f5f9",
};

// ─── §二 持有收益横条图 ─────────────────────────────────────────────────────

/**
 * 生成持有收益横条图（变体 A/B 通用）
 * 按持有收益从高到低排列
 */
export function buildPnlBarChart(
  positions: PortfolioPositionMetrics[],
): EchartsConfig | null {
  const validPositions = positions
    .filter((p) => p.l0_ok && p.pnl_abs != null)
    .sort((a, b) => (b.pnl_abs ?? 0) - (a.pnl_abs ?? 0));

  if (validPositions.length === 0) return null;

  const categoryData = validPositions.map((p) => {
    const name = (p.fund_name ?? p.fund_code).replace(/[A-Z]+$/, "").trim();
    return name.length > 8 ? name.slice(0, 8) + "…" : name;
  });

  const seriesData = validPositions.map((p, idx) => {
    const value = p.pnl_abs ?? 0;
    const isPositive = value >= 0;
    return {
      value,
      itemStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            {
              offset: 0,
              color: isPositive ? COLORS.green : "#ef4444",
            },
            {
              offset: 1,
              color: isPositive ? COLORS.greenLight : "#fca5a5",
            },
          ],
        },
        borderRadius: [0, 8, 8, 0],
      },
    };
  });

  const option = {
    title: {
      text: "各持仓持有收益（元）",
      subtext: "最新市值 − 买入支付金额 + 现金分红",
      left: "center",
      textStyle: { fontSize: 16, fontWeight: 600, color: COLORS.text },
      subtextStyle: { fontSize: 11, color: COLORS.textSecondary },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        const sign = p.value >= 0 ? "+" : "";
        return `${p.name}: ${sign}${p.value} 元`;
      },
    },
    grid: {
      left: "3%",
      right: "12%",
      bottom: "8%",
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: "元",
      axisLabel: { color: COLORS.textSecondary },
      splitLine: {
        lineStyle: { color: COLORS.bgLight, type: "dashed" },
      },
    },
    yAxis: {
      type: "category",
      data: categoryData,
      inverse: true,
      axisLabel: { color: COLORS.textMuted, fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        data: seriesData,
        label: {
          show: true,
          position: "right",
          formatter: (params: { value: number }) => {
            const sign = params.value >= 0 ? "+" : "";
            return `${sign}${params.value} 元`;
          },
          color: COLORS.textDark,
          fontWeight: 600,
        },
      },
    ],
  };

  return {
    title: "各持仓持有收益（元）",
    subtext: "最新市值 − 买入支付金额 + 现金分红",
    option,
  };
}

// ─── §三 大类环图 ───────────────────────────────────────────────────────────

/**
 * 生成持仓结构分布饼图（按市值，7大分类）
 */
export function buildCategoryPieChart(
  slices: CategorySlice[],
): EchartsConfig | null {
  const validSlices = slices.filter((s) => s.market_value > 0);

  if (validSlices.length === 0) return null;

  const data = validSlices.map((s) => ({
    value: s.market_value,
    name: s.category,
  }));

  const totalMarketValue = validSlices.reduce((sum, s) => sum + s.market_value, 0);

  // 7类颜色映射
  const categoryColorMap: Record<string, string> = {
    QDII型: "#3b82f6",   // blue
    指数型: "#22c55e",    // green
    股票型: "#ef4444",    // red
    货币型: "#f59e0b",    // amber
    债券型: "#8b5cf6",    // violet
    混合型: "#06b6d4",    // cyan
    其他: "#94a3b8",      // grayDark
  };

  const colors = validSlices.map((s) => categoryColorMap[s.category] ?? "#94a3b8");

  const option = {
    title: {
      text: "持仓结构分布（按市值）",
      subtext: `按最新市值 · 合计 ${totalMarketValue.toLocaleString("zh-CN")} 元`,
      left: "center",
      textStyle: { fontSize: 16, fontWeight: 600, color: COLORS.text },
      subtextStyle: { fontSize: 11, color: COLORS.textSecondary },
    },
    tooltip: {
      trigger: "item",
      formatter: (params: { name: string; value: number; percent: number }) => {
        return `${params.name}<br/>市值 ${params.value.toLocaleString("zh-CN")} 元<br/>占比 ${params.percent}%`;
      },
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: COLORS.border,
    },
    legend: {
      orient: "horizontal",
      bottom: 0,
      textStyle: { color: COLORS.textSecondary },
    },
    color: colors,
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "46%"],
        itemStyle: {
          borderRadius: 10,
          borderColor: "#fff",
          borderWidth: 4,
        },
        emphasis: { scale: true, scaleSize: 6 },
        label: {
          formatter: (params: { name: string; percent: number }) => {
            return `${params.name} ${params.percent}%`;
          },
          color: COLORS.textDark,
          fontSize: 12,
          fontWeight: 600,
        },
        labelLine: {
          length: 12,
          length2: 8,
          lineStyle: { color: COLORS.grayLight },
        },
        data,
      },
    ],
  };

  return {
    title: "持仓结构分布（按市值）",
    subtext: `按最新市值 · 合计 ${totalMarketValue.toLocaleString("zh-CN")} 元`,
    option,
  };
}

// ─── 辅助：Markdown 包裹 ────────────────────────────────────────────────────

/**
 * 将 echarts 配置包装为 markdown 代码块
 */
export function wrapEchartsMarkdown(config: EchartsConfig): string {
  return `\`\`\`echarts\n${JSON.stringify(config.option, null, 2)}\n\`\`\``;
}
