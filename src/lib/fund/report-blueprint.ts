import type { FundArchetype } from "@/harness/infra/fund_knowledge/l0-registry";
import type { L0AssetAllocation } from "@/lib/l0/registry-portfolio";
import { extractAssetAllocationFromL1Hits } from "@/lib/kb/disclosure-parse";
import type { ExploreHit } from "@/harness/infra/fund_knowledge/explore";

export type { FundArchetype };

/** 蓝图 §3 · 有数据才出的图表 ID（本期不含业绩对比图） */
export const FUND_CHART_IDS = ["ASSET-01", "HOLD-01", "FEE-01"] as const;

export type FundChartId = (typeof FUND_CHART_IDS)[number];

/** 各章典型图表数（不限制全报告总块数） */
export const TYPICAL_ECHARTS_PER_CHAPTER = 3;

export function referenceEchartsCount(_archetype: FundArchetype): number {
  return TYPICAL_ECHARTS_PER_CHAPTER;
}

export function formatAsOfTradeDateLabel(iso?: string | null): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/^\d{8}$/.test(iso)) {
    return `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}`;
  }
  return iso;
}

function hasAssetAllocationData(alloc?: L0AssetAllocation | null): boolean {
  if (!alloc) return false;
  return [alloc.stock_pct, alloc.bond_pct, alloc.cash_pct, alloc.other_pct].some(
    (v) => v != null && v > 0,
  );
}

/**
 * ASSET-01：L1 季报「资产组合」优先；其次 L0 AKShare 资产比例
 */
export function resolveAssetAllocationForCharts(input: {
  l1Hits: ExploreHit[];
  l0Allocation?: L0AssetAllocation | null;
}): L0AssetAllocation | undefined {
  const parsed = extractAssetAllocationFromL1Hits(input.l1Hits);
  if (hasAssetAllocationData(parsed)) return parsed!;
  if (hasAssetAllocationData(input.l0Allocation)) return input.l0Allocation!;
  return undefined;
}

/** 三句话 / 第二章 · 业绩基准话术（本期不出基准对比图） */
export function buildBenchmarkSummarySentence(input: {
  benchmarkName?: string;
  benchmarkReturn1yPct?: number;
  return1yPct?: number;
  excessReturn1yPct?: number;
}): string | null {
  const { benchmarkName, benchmarkReturn1yPct, return1yPct, excessReturn1yPct } = input;
  if (!benchmarkName?.trim()) return null;

  if (benchmarkReturn1yPct != null && return1yPct != null) {
    const excess =
      excessReturn1yPct ??
      Math.round((return1yPct - benchmarkReturn1yPct) * 100) / 100;
    if (excess > 0.5) {
      return `近一年跑赢业绩基准约 **${excess.toFixed(2)}%**（基准：${benchmarkName}）。`;
    }
    if (excess < -0.5) {
      return `近一年跑输业绩基准约 **${Math.abs(excess).toFixed(2)}%**（基准：${benchmarkName}）。`;
    }
    return `近一年与业绩基准大致接近（基准：${benchmarkName}）。`;
  }

  return `业绩比较基准为 **${benchmarkName}**；涨跌详见第二章关键指标。`;
}

export function benchmarkVerifyWarnings(md: string): string[] {
  const warnings: string[] = [];
  const hasBenchmarkRow = /\| 业绩比较基准 \|/.test(md);
  const hasPerfChart = /### 业绩对比/.test(md) && /```echarts/.test(md);

  if (hasBenchmarkRow && !/三句话[\s\S]{0,800}基准|业绩比较基准|跑赢|跑输|大致接近/.test(md)) {
    warnings.push("有业绩比较基准行时，三句话或正文应提及基准。");
  }
  if (hasPerfChart) {
    warnings.push("本期不应出现业绩对比图（PERF-01 已取消）。");
  }
  return warnings;
}
