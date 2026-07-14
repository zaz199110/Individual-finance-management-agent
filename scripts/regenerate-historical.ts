import fs from "node:fs";
import path from "node:path";
import { buildPortfolioReportBlueprint } from "@/lib/portfolio/report-blueprint";
import type { PortfolioGatherResult, PortfolioPositionMetrics } from "@/lib/portfolio/holdings-nav-gather";
import { composePortfolioReport } from "@/lib/portfolio/portfolio-report-compose";
import { classifyFund, aggregateCategories, type PortfolioDisplayCategory } from "@/lib/portfolio/category-map";
import { buildPnlBarChart, buildCategoryPieChart, wrapEchartsMarkdown } from "@/lib/portfolio/echarts-skeleton";

const positions: PortfolioPositionMetrics[] = [
  {
    fund_code: "000001",
    fund_name: "华夏成长混合",
    invested_at: "2024-01-15",
    fund_type: "混合型",
    paid_amount: 50000,
    shares: 25000,
    l0_ok: true,
    nav_latest: 1.45,
    market_value: 36250,
    pnl_abs: -13500,
    pnl_pct: -27.0,
    dividend_missing: false,
    portfolio_role: "权益进攻（核心）",
  },
  {
    fund_code: "000002",
    fund_name: "嘉实沪深300ETF联接",
    invested_at: "2024-02-20",
    fund_type: "指数型",
    paid_amount: 30000,
    shares: 0,
    l0_ok: false,
    pnl_abs: 0,
    pnl_pct: 0,
    dividend_missing: false,
    portfolio_role: "权益配置",
  },
  {
    fund_code: "000003",
    fund_name: "易方达蓝筹精选混合",
    invested_at: "2024-03-10",
    fund_type: "混合型",
    paid_amount: 40000,
    shares: 20000,
    l0_ok: true,
    nav_latest: 1.046,
    market_value: 20920,
    pnl_abs: -19080,
    pnl_pct: -47.7,
    dividend_missing: false,
    portfolio_role: "权益进攻",
  },
  {
    fund_code: "000004",
    fund_name: "招商中证白酒指数",
    invested_at: "2024-04-05",
    fund_type: "指数型",
    paid_amount: 25000,
    shares: 12500,
    l0_ok: true,
    nav_latest: 1.018,
    market_value: 12725,
    pnl_abs: -12275,
    pnl_pct: -49.1,
    dividend_missing: false,
    portfolio_role: "行业主题配置",
  },
  {
    fund_code: "000005",
    fund_name: "中欧医疗健康混合",
    invested_at: "2024-05-12",
    fund_type: "混合型",
    paid_amount: 35000,
    shares: 17500,
    l0_ok: true,
    nav_latest: 1.0247,
    market_value: 17932.25,
    pnl_abs: -15205.75,
    pnl_pct: -43.4,
    dividend_missing: false,
    portfolio_role: "行业主题配置（卫星）",
  },
];

const gather: PortfolioGatherResult = {
  as_of_trade_date: "2026-06-23",
  positions,
  total_cost: 180000,
  total_market_value: 87827.25,
  total_pnl_abs: -60060.75,
  total_pnl_pct: -40.0,
  l0_degraded: ["nav_missing:000002"],
};

const categoryMap = new Map(
  positions.map((p) => [p.fund_code, classifyFund({ fund_type: p.fund_type, fund_name: p.fund_name })]),
);

async function main() {
  const blueprint = buildPortfolioReportBlueprint({
    reportName: "持仓分析报告 2026-06-24",
    dateLabel: "2026年6月24日",
    asOfTradeDate: gather.as_of_trade_date,
    gather,
    categoryMap,
  });

  const composeResult = await composePortfolioReport({
    markdown: blueprint.markdown,
    gather,
  });

  // ECharts rendering (matching report-draft.ts step 5.6)
  let finalMarkdown = composeResult.markdown;

  const pnlBarChart = buildPnlBarChart(gather.positions);
  if (pnlBarChart) {
    finalMarkdown = finalMarkdown.replace(
      "<!-- PORT-CH2-ECHARTS -->",
      wrapEchartsMarkdown(pnlBarChart),
    );
  }

  const categoryRows = gather.positions
    .filter((p) => p.l0_ok && p.market_value != null && p.market_value > 0)
    .map((p) => ({
      market_value: p.market_value!,
      category: (categoryMap.get(p.fund_code)?.display ?? "其他") as PortfolioDisplayCategory,
    }));
  const categorySlices = aggregateCategories(categoryRows);
  const categoryPieChart = buildCategoryPieChart(categorySlices);
  if (categoryPieChart) {
    finalMarkdown = finalMarkdown.replace(
      "<!-- PORT-CH3-ECHARTS -->",
      wrapEchartsMarkdown(categoryPieChart),
    );
  }

  const outPath = path.resolve(
    "data/reports/portfolio/published/0b165e0d-1782272871780.md",
  );
  fs.writeFileSync(outPath, finalMarkdown, "utf8");
  console.log("Written:", outPath, "Length:", finalMarkdown.length);
  console.log("Filled:", composeResult.filledPlaceholders);
  console.log("Unfilled:", composeResult.unfilledPlaceholders);
}

main().catch(console.error);
