/**
 * report-blueprint.ts · 持仓分析报告模板拼装
 *
 * 职责：接收 gather 结果 + category-map，生成完整 md + compose 占位符
 * 参考：requirement/docs/samples/portfolio-report-blueprint.md
 */

import type { PortfolioGatherResult, PortfolioPositionMetrics } from "./holdings-nav-gather";
import type { CategoryResult } from "./category-map";

// ─── 占位符常量 ──────────────────────────────────────────────────────────────

export const PLACEHOLDERS = {
  /** §二 收益概况 */
  CH2_INTRO: "<!-- PORT-CH2-INTRO -->",
  /** §三 结构分布 */
  CH3_INTRO: "<!-- PORT-CH3-INTRO -->",
  CH4_FUND: (code: string) => `<!-- PORT-CH4-FUND-${code} -->`,
  /** §五 风险与合规 */
  CH5_SUPP: "<!-- PORT-CH5-SUPP -->",
} as const;

// ─── 输入接口 ────────────────────────────────────────────────────────────────

export interface BlueprintParams {
  /** 报告标题（已含日期） */
  reportName: string;
  /** 格式化日期，如 "2026年6月15日" */
  dateLabel: string;
  /** 数据截至日期，如 "2026年6月13日" */
  asOfTradeDate: string;
  /** gather 汇总结果 */
  gather: PortfolioGatherResult;
  /** 每只基金的大类映射结果 */
  categoryMap: Map<string, CategoryResult>;
  /** 是否由定时任务触发 */
  isScheduled?: boolean;
}

// ─── 输出接口 ────────────────────────────────────────────────────────────────

export interface BlueprintResult {
  /** 完整 markdown（含占位符） */
  markdown: string;
  /** 需要 LLM 填充的占位符列表 */
  placeholders: string[];
  /** 报告元数据（供 draft-meta 使用） */
  metadata: {
    reportName: string;
    asOfTradeDate: string;
    totalCost: number;
    totalMarketValue: number;
    totalPnlAbs: number;
    totalPnlPct: number;
    positionCount: number;
    l0Degraded: string[];
    dividendMissingFunds: string[];
  };
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatPnlAbs(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${formatMoney(n)} 元`;
}

/** 根据 L0 状态返回行内容或「暂无行情」 */
function positionCell(
  pos: PortfolioPositionMetrics,
  field: keyof PortfolioPositionMetrics,
): string {
  if (!pos.l0_ok) return "暂无行情";
  const val = pos[field];
  if (val == null) return "暂无行情";
  return String(val);
}

/** Aggregate positions by fund_code for fund-level views (§二-§五).
 *  §一 keeps per-transaction rows; non-§一 sections need per-fund rollup. */
export function aggregateByFundCode(positions: PortfolioPositionMetrics[]): PortfolioPositionMetrics[] {
  const map = new Map<string, PortfolioPositionMetrics>();
  // Process in order so later entries' names/as_of_trade_date win
  for (const pos of positions) {
    const existing = map.get(pos.fund_code);
    if (!existing) {
      map.set(pos.fund_code, { ...pos });
      continue;
    }
    // Sum financial metrics
    existing.paid_amount += pos.paid_amount;
    existing.shares += pos.shares;
    if (pos.market_value != null) {
      existing.market_value = (existing.market_value ?? 0) + pos.market_value;
    }
    if (pos.cash_dividend_total != null) {
      existing.cash_dividend_total = (existing.cash_dividend_total ?? 0) + pos.cash_dividend_total;
    }
    // Aggregate PnL absolute; recompute percentage later
    if (pos.pnl_abs != null) {
      existing.pnl_abs = (existing.pnl_abs ?? 0) + pos.pnl_abs;
    }
    // Take latest name and trade date
    if (pos.fund_name) existing.fund_name = pos.fund_name;
    if (pos.as_of_trade_date && (!existing.as_of_trade_date || pos.as_of_trade_date > existing.as_of_trade_date)) {
      existing.as_of_trade_date = pos.as_of_trade_date;
    }
    // Recompute aggregated PnL pct
    if (existing.paid_amount > 0 && existing.pnl_abs != null) {
      existing.pnl_pct = (existing.pnl_abs / existing.paid_amount) * 100;
    }
  }
  return [...map.values()];
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

export function buildPortfolioReportBlueprint(
  params: BlueprintParams,
): BlueprintResult {
  const { reportName, dateLabel, asOfTradeDate, gather, categoryMap } = params;
  const { positions, total_cost, total_market_value, total_pnl_abs, total_pnl_pct, l0_degraded, dividendMissingFunds } = gather;

  const placeholders: string[] = [];
  const positionCount = positions.length;
  const hasDividendMissing = (dividendMissingFunds ?? []).length > 0;

  // Aggregate by fund_code for fund-level views (§二-§五)
  // §一 keeps per-transaction rows
  const fundLevel = aggregateByFundCode(positions);

  // ─── 构建 md ──────────────────────────────────────────────────────────────

  const sections: string[] = [];

  // ── 标题 ──
  sections.push(`# ${reportName}`);
  sections.push("");
  sections.push(`*为您生成 · ${dateLabel}*`);
  sections.push(`*数据截至 **${asOfTradeDate}（最近交易日）***`);

  if (params.isScheduled) {
    sections.push("*自动生成*");
  }
  sections.push("");

  // ── §一 持仓 ──
  sections.push("---");
  sections.push("");
  sections.push("## 持仓明细");
  sections.push("");
  sections.push(
    `> 截至 **${asOfTradeDate}**，以下持仓与您确认保存的一致。买入支付金额含申购费，份额以确认为准。持有收益为系统测算值：非货币基金按公开净值与分红计算，货币基金按每日万份收益实际累加计算，可能与您的代销 App 或对账单略有差异。`,
  );

  if (hasDividendMissing) {
    const names = dividendMissingFunds.map((n) => `「${n}」`).join("、");
    sections.push(`> ⚠️ ${names} **未纳入现金分红**，持有收益（元）= 最新市值 − 买入支付金额。已卖出份额不在本表。`);
    sections.push("");
  }

  // 持仓表头
  sections.push(
    "| 基金代码 | 基金名称 | 买入日期 | 买入支付金额 | 持有份额 | 最新市值 | 持有收益（元） | 持有收益率 |",
  );
  sections.push(
    "|----------|----------|----------|--------------|----------|----------|----------------|------------|",
  );

  // 持仓行
  for (const pos of positions) {
    const code = pos.fund_code;
    const name = pos.fund_name ?? "—";
    const investedAt = pos.invested_at.slice(0, 10);
    const paidAmount = formatMoney(pos.paid_amount);
    const shares = pos.l0_ok ? formatMoney(pos.shares) : "—";
    const marketValue = pos.l0_ok && pos.market_value != null ? `${formatMoney(pos.market_value)} 元` : "暂无行情";
    const pnlAbs =
      pos.l0_ok
        ? (pos.pnl_abs != null ? formatPnlAbs(pos.pnl_abs) : "暂无行情")
        : "暂无行情";
    const pnlPct =
      pos.l0_ok
        ? (pos.pnl_pct != null ? formatPct(pos.pnl_pct) : "暂无行情")
        : "暂无行情";

    sections.push(
      `| **${code}** | ${name} | ${investedAt} | **${paidAmount} 元** | ${shares} | **${marketValue}** | **${pnlAbs}** | **${pnlPct}** |`,
    );
  }

  // 合计行
  sections.push(
    `| **合计** | — | — | **${formatMoney(total_cost)} 元** | — | **${formatMoney(total_market_value)} 元** | **${formatPnlAbs(total_pnl_abs)}** | **${formatPct(total_pnl_pct)}** |`,
  );
  sections.push("");

  // ── §二 组合表现与收益 ──
  sections.push("---");
  sections.push("");
  sections.push("## 收益概况");
  sections.push("");
  sections.push(
    "**持有收益（元）**：非货币基金 = 最新市值 − 买入支付金额 + 持有期 **现金分红**；货币基金 = 累计每日万份收益 × 持有份额 ÷ 10000。**持有收益率** = 持有收益（元）÷ 买入支付金额。",
  );
  sections.push("");
  sections.push(
    "> **测算说明：** 结果为系统测算，不是对账单。分红登记日、份额强增/强减等若与您的账户不一致，请以您的交易记录为准；可在确认报告前通过对话补充，我会更新测算。",
  );
  sections.push("");

  // LLM 开篇占位符
  sections.push(PLACEHOLDERS.CH2_INTRO);
  placeholders.push(PLACEHOLDERS.CH2_INTRO);
  sections.push("");

  // 解读表
  sections.push("| 维度 | 您的组合 | 一句话解读 |");
  sections.push("|------|----------|------------|");
  const overallTrend =
    total_pnl_abs > 0
      ? "整体为正收益"
      : total_pnl_abs < 0
        ? "整体为负收益"
        : "整体盈亏持平";

  sections.push(
    `| 持有收益合计 | **${formatPnlAbs(total_pnl_abs)}**（**${formatPct(total_pnl_pct)}**） | 自各笔买入以来，${overallTrend} |`,
  );

  // 找贡献最大和波动缓冲
  const sortedByPnlPct = [...fundLevel]
    .filter((p) => p.l0_ok && p.pnl_pct != null)
    .sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0));

  if (sortedByPnlPct.length > 0) {
    const best = sortedByPnlPct[0];
    sections.push(
      `| 贡献最大 | ${best.fund_name ?? best.fund_code} **${formatPct(best.pnl_pct ?? 0)}** | 权益仓位带来主要弹性 |`,
    );
  }
  sections.push("");



  // ECharts 横条图占位（后续由 echarts-skeleton.ts 生成）
  sections.push("<!-- PORT-CH2-ECHARTS -->");
  sections.push("");

  // ── §三 结构分布 ──
  sections.push("---");
  sections.push("");
  sections.push("## 结构分布");
  sections.push("");

  // 引导语占位符（TPL 或 LLM 填充一句简短引导语，不重复图表中的数字）
  sections.push(PLACEHOLDERS.CH3_INTRO);
  placeholders.push(PLACEHOLDERS.CH3_INTRO);
  sections.push("");

  // 大类表
  sections.push("| 分类 | 最新市值 | 占组合 | 主要基金 |");
  sections.push("|------|-------------------|--------|----------|");

  // 按大类分组找主要基金
  const categoryFunds = new Map<string, string[]>();
  for (const pos of fundLevel) {
    const cat = categoryMap.get(pos.fund_code);
    const displayCat = cat?.display ?? "混合";
    if (!categoryFunds.has(displayCat)) {
      categoryFunds.set(displayCat, []);
    }
    const shortName = (pos.fund_name ?? pos.fund_code).replace(/[A-Z]+$/, "").trim();
    categoryFunds.get(displayCat)!.push(shortName);
  }

  // 按分类计算最新市值汇总
  const categoryBreakdown = new Map<string, number>();
  let totalMarketValue = 0;
  for (const pos of fundLevel) {
    const cat = categoryMap.get(pos.fund_code);
    const displayCat = cat?.display ?? "混合";
    const mv = pos.market_value ?? 0;
    categoryBreakdown.set(displayCat, (categoryBreakdown.get(displayCat) ?? 0) + mv);
    totalMarketValue += mv;
  }

  // 按市值降序排列
  const sortedCategories = [...categoryBreakdown.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  for (const [category, amount] of sortedCategories) {
    const pct = totalMarketValue > 0 ? (amount / totalMarketValue) * 100 : 0;
    const mainFunds = categoryFunds.get(category)?.slice(0, 2).join("、") ?? "—";
    sections.push(
      `| **${category}** | **${formatMoney(amount)} 元** | **${pct.toFixed(1)}%** | ${mainFunds} |`,
    );
  }
  sections.push("");

  // ECharts 环图占位
  sections.push("<!-- PORT-CH3-ECHARTS -->");
  sections.push("");

  // ── §四 主要持仓基金要点 ──
  sections.push("---");
  sections.push("");
  sections.push("## 基金解读");
  sections.push("");

  // 一览表
  sections.push("| 基金 | 类型 | 在本组合中的角色 | 本期表现 |");
  sections.push("|------|------|------------------|----------|");

  for (const pos of fundLevel) {
    const cat = categoryMap.get(pos.fund_code);
    const displayCat = cat?.display ?? "—";
    const shortName = (pos.fund_name ?? pos.fund_code).replace(/[A-Z]+$/, "").trim();
    const pnlPct = pos.l0_ok && pos.pnl_pct != null ? formatPct(pos.pnl_pct) : "—";

    const role = pos.portfolio_role ?? "—";

    sections.push(
      `| **${pos.fund_code}** ${shortName} | ${displayCat} | ${role} | **${pnlPct}** |`,
    );
  }
  sections.push("");

  // LLM 分基段落占位符（每只基金一个）
  for (const pos of fundLevel) {
    sections.push(`### ${pos.fund_name ?? pos.fund_code}（${pos.fund_code}）`);
    sections.push("");
    sections.push(PLACEHOLDERS.CH4_FUND(pos.fund_code));
    placeholders.push(PLACEHOLDERS.CH4_FUND(pos.fund_code));
    sections.push("");
  }

  // ── §五 风险与合规 ──
  sections.push("---");
  sections.push("");
  sections.push("## 风险与合规");
  sections.push("");

  // RULE 必含句（PORT-RISK-01）
  sections.push("| 主题 | 说明 |");
  sections.push("|------|------|");

  // R1: 单基集中度检查（paid_amount >= 30%）
  const sortedByCost = [...fundLevel].sort(
    (a, b) => (b.paid_amount ?? 0) - (a.paid_amount ?? 0),
  );
  if (sortedByCost.length > 0) {
    const maxPctFund = sortedByCost[0];
    const fundPct =
      total_cost > 0
        ? ((maxPctFund.paid_amount / total_cost) * 100).toFixed(1)
        : "0";
    if (Number.parseFloat(fundPct) >= 30) {
      sections.push(
        `| **单基集中度** | ${maxPctFund.fund_name ?? maxPctFund.fund_code} 占组合买入成本约 **${fundPct}%**，高于常见分散参考线，波动可能较大 |`,
      );
    }
  }

  // R2: 前三大集中度检查（合计 >= 60%）
  if (sortedByCost.length >= 3) {
    const top3Cost = sortedByCost.slice(0, 3).reduce((s, p) => s + (p.paid_amount ?? 0), 0);
    const top3Pct = total_cost > 0 ? ((top3Cost / total_cost) * 100).toFixed(1) : "0";
    if (Number.parseFloat(top3Pct) >= 60) {
      sections.push(
        `| **持仓集中** | 前三只基金合计占组合买入成本约 **${top3Pct}%**，分散度偏低，波动可能较大 |`,
      );
    }
  }

  // R4: 行业集中检查（行业主题指数占股票类 >= 50%）
  const stockFunds = positions.filter((p) => {
    const cat = categoryMap.get(p.fund_code);
    return cat?.display === "股票型";
  });
  if (stockFunds.length > 0) {
    const stockCost = stockFunds.reduce((s, p) => s + (p.paid_amount ?? 0), 0);
    const stockPct = total_cost > 0 ? ((stockCost / total_cost) * 100).toFixed(1) : "0";
    // 检查是否有行业主题基金（非宽基）
    const sectorFunds = stockFunds.filter((p) => {
      const name = p.fund_name ?? "";
      return /行业|主题|消费|医药|科技|白酒|新能源/i.test(name);
    });
    if (sectorFunds.length > 0) {
      const sectorCost = sectorFunds.reduce((s, p) => s + (p.paid_amount ?? 0), 0);
      const sectorPctOfStock = stockCost > 0 ? ((sectorCost / stockCost) * 100).toFixed(1) : "0";
      if (Number.parseFloat(sectorPctOfStock) >= 50) {
        const sectorName = sectorFunds[0].fund_name?.match(/(行业|主题|消费|医药|科技|白酒|新能源)/)?.[1] ?? "行业";
        sections.push(
          `| **行业集中** | 股票敞口集中于 **${sectorName}** 主题，波动可能高于宽基分散组合 |`,
        );
      }
    }
  }

  // R5: 权益增强弹性检查
  const enhancedBondFunds = positions.filter((p) => {
    const name = p.fund_name ?? "";
    return /增强|二级债|可转债/i.test(name);
  });
  if (enhancedBondFunds.length > 0) {
    sections.push(
      `| **权益增强** | 含权益增强的债基在股市波动时净值弹性更大 |`,
    );
  }

  // LLM 补句占位符
  sections.push(PLACEHOLDERS.CH5_SUPP);
  placeholders.push(PLACEHOLDERS.CH5_SUPP);
  sections.push("");

  // ── 尾部 ──
  sections.push("---");
  sections.push("");

  const markdown = sections.join("\n");

  return {
    markdown,
    placeholders,
    metadata: {
      reportName,
      asOfTradeDate,
      totalCost: total_cost,
      totalMarketValue: total_market_value,
      totalPnlAbs: total_pnl_abs,
      totalPnlPct: total_pnl_pct,
      positionCount,
      l0Degraded: l0_degraded,
      dividendMissingFunds,
    },
  };
}
