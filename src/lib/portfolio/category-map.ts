/** §三 展示大类 · 7分类用于持仓结构分布饼图 */

export type PortfolioDisplayCategory =
  | "QDII型"
  | "指数型"
  | "股票型"
  | "货币型"
  | "债券型"
  | "混合型"
  | "其他";

export interface CategoryInput {
  /** L0 fund_type, e.g. "股票型", "混合型", "债券型", "指数型", "ETF", "QDII", "货币型" */
  fund_type?: string;
  /** Fund name for regex fallback */
  fund_name?: string;
}

export interface CategoryResult {
  display: PortfolioDisplayCategory;
  /** Optional footnote if classification is uncertain */
  footnote?: string;
}

/**
 * Classify a single fund into one of 7 display categories.
 *
 * Classification rules are order-sensitive — the first matching rule wins.
 */
export function classifyFund(input: CategoryInput): CategoryResult {
  const fundType = (input.fund_type ?? "").trim();
  const fundName = (input.fund_name ?? "").trim();

  // 1. QDII型 — absolute priority, even over ETF
  if (/QDII/i.test(fundType) || /QDII/i.test(fundName)) {
    return { display: "QDII型" };
  }

  // 2. 指数型 — ETFs (unless already caught by QDII)
  if (/ETF/i.test(fundName) || fundType === "ETF" || fundType === "指数型") {
    return { display: "指数型" };
  }

  // 3. 股票型
  if (/股票|偏股|权益/.test(fundType) || /股票|权益|偏股/.test(fundName)) {
    return { display: "股票型" };
  }

  // 4. 货币型
  if (/货币/.test(fundType) || /货币|现金管理|钱袋子/.test(fundName)) {
    return { display: "货币型" };
  }

  // 5. 债券型
  if (/债|一级债|二级债|存单|利率/.test(fundType) || /债|存单|利率|纯债|增强回报|双息/.test(fundName)) {
    return { display: "债券型" };
  }

  // 6. 混合型
  if (/混合/.test(fundType) || /混合|平衡|灵活配置/.test(fundName)) {
    return { display: "混合型" };
  }

  // 7. 其他 — FOF, 商品, unclassified, etc.
  return { display: "其他" };
}

export interface CategorySlice {
  category: PortfolioDisplayCategory;
  /** Total market value in this category */
  market_value: number;
  /** Percentage of total market value, 0–100 (rounded to 1 decimal) */
  pct: number;
}

/**
 * Aggregate classified rows into pie-chart slices.
 *
 * - Sums `market_value` per category.
 * - Computes `pct` as (category_sum / total_sum) * 100, rounded to 1 decimal.
 * - Only categories with `market_value > 0` are included.
 * - Returns an empty array when the grand total is 0.
 */
export function aggregateCategories(
  rows: Array<{ market_value: number; category: PortfolioDisplayCategory }>,
): CategorySlice[] {
  const totals: Record<string, number> = {};
  let totalSum = 0;

  for (const row of rows) {
    const mv = row.market_value;
    if (mv <= 0) continue;
    totalSum += mv;
    totals[row.category] = (totals[row.category] ?? 0) + mv;
  }

  if (totalSum <= 0) {
    return [];
  }

  const result: CategorySlice[] = [];
  for (const [category, catSum] of Object.entries(totals)) {
    if (catSum > 0) {
      const rawPct = (catSum / totalSum) * 100;
      const pct = Math.round(rawPct * 10) / 10;
      result.push({
        category: category as PortfolioDisplayCategory,
        market_value: Math.round(catSum * 100) / 100,
        pct,
      });
    }
  }

  return result;
}
