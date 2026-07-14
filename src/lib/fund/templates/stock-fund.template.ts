/**
 * 股票型基金报告模板 (v1.0 · 8章 · 完全自包含)
 *
 * 适用范围: 所有 fund_type 包含 "股票型" 的基金
 * 当前自选代表: 161130（纳指ETF联接）
 *
 * 章节结构 (8章; Ch3 缺失→7章 序号前移):
 *   1. 产品介绍      — 13 项身份表（基金管理人、托管人等）
 *   2. 基金经理      — 姓名/任职起始/任职结束
 *   3. 投资范围      — LLM 一句话总结 ≤60 字（缺失则跳过并 renumber）
 *   4. 费率结构      — 管理费/托管费/最高认购费/最高申购费/最高赎回费
 *   5. 前十大重仓    — 股票代码/名称/市值 表格
 *   6. 持仓资产比例  — 饼图（大类资产占比）
 *   7. 温馨提示      — 固定风险提示
 *   8. 引用说明      — 引用表（基金产品资料概要 / 最新季报）
 *
 * ## 硬约束
 * - C1: 完全自包含，不依赖任何共有模块
 * - C2: Ch3 缺失时章节序号前移
 * - C3: 字段缺失则不展示该行
 */

import type { FundReportMarkdownResult, TemplateDeps } from "./template-types";
import type { L0FundManagerRecord, L0TopHolding } from "@/lib/l0/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 股票型基金资产配置饼图色板 */
const STOCK_ASSET_COLORS = [
  "#ef4444", // 股票 / 权益
  "#3b82f6", // 债券
  "#22c55e", // 现金 / 银行存款
  "#f59e0b", // 基金
  "#8b5cf6", // 其他
  "#ec4899",
  "#06b6d4",
  "#94a3b8",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockFundParams {
  // ── Chapter 1: 产品介绍 ──
  fundCode: string;
  fundName: string;
  typeLabel?: string;
  riskLevel: string;
  management?: string;       // 基金管理人
  custodian?: string;        // 基金托管人
  foundDate?: string;        // 成立日期
  aumYi?: number;            // 基金规模（亿元）
  aumDate?: string;          // 规模截止日期
  minAmount?: number;        // 起投金额（万元）
  expReturn?: number;        // 预期收益率
  return1yPct?: number;      // 近一年涨跌（%）
  maxDrawdown1yPct?: number; // 近一年最大回撤（%）
  benchmarkName?: string;    // 业绩比较基准
  // ── Chapter 2: 基金经理 ──
  fundManagers?: L0FundManagerRecord[];

  // ── Chapter 3: 投资范围（skippable）──
  scopeExcerpt?: string;     // LLM 一句话总结（≤60字）
  scopeFootnote?: string;

  // ── Chapter 4: 费率结构 ──
  managementFee?: number;    // 管理费（%）
  custodyFee?: number;       // 托管费（%）
  subscriptionMax?: string;  // 最高认购费
  purchaseMax?: string;      // 最高申购费
  redemptionMax?: string;    // 最高赎回费
  salesServiceFee?: number;  // 销售服务费（%）

  // ── Chapter 5: 前十大重仓 ──
  topHoldings?: L0TopHolding[];
  holdingsAsOf?: string;

  // ── Chapter 6: 持仓资产比例 ──
  assetAllocation?: {
    items: Array<{ name: string; pct: number }>;
    asOfDate: string;
    footnote?: string;
  };

  // ── Chapter 8: 引用说明 ──
  referenceChapter: string;

  // ── Global ──
  navDate: string;
  ymd: string;
  dateLabel: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function buildStockFundReportMarkdown(
  params: StockFundParams,
): FundReportMarkdownResult {
  const hasScope = Boolean(params.scopeExcerpt);

  // 章节序号：Ch3 缺失时后续章节序号 -1
  const cn = chapterNumbers(hasScope);

  const identityTable = buildIdentityTable(params, cn.intro);
  const managerSection = buildManagerSection(params.fundManagers, cn.manager);
  const scopeSection = hasScope
    ? buildScopeSection(params.scopeExcerpt!, params.scopeFootnote, cn.scope)
    : "";
  const feeSection = buildFeeSection(params, cn.fee);
  const holdingsSection = buildTopHoldingsSection(
    params.topHoldings,
    cn.holdings,
  );
  const assetAllocSection = buildAssetAllocationSection(
    params.assetAllocation,
    cn.assetAlloc,
  );

  // 图表计数
  let chartCount = 0;
  if (params.assetAllocation?.items?.length) chartCount++;

  const markdown = `# ${params.fundCode}-${params.fundName}-基金解读-${params.ymd}

*为您生成 · ${params.dateLabel}*
*行情与净值数据截至 **${params.navDate}**（最近一个交易日）*

---

${identityTable}

---

${managerSection}

---

${hasScope ? `${scopeSection}

---

` : ""}${feeSection}

---

${holdingsSection}

---

${assetAllocSection}

---

## ${cn.disclaimer}. 温馨提示

本报告由系统根据公开信息与入库披露整理，**仅供参考**，不构成任何投资建议或收益承诺。基金过往业绩不预示未来表现，投资须自担风险。

---

${params.referenceChapter}

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;

  return { markdown, chartCount };
}

// ---------------------------------------------------------------------------
// Chapter number computation
// ---------------------------------------------------------------------------

function chapterNumbers(hasScope: boolean) {
  let n = 1;
  return {
    intro: n++,                    // 1
    manager: n++,                  // 2
    scope: hasScope ? n++ : -1,    // 3 or skipped
    fee: n++,                      // 3 or 4
    holdings: n++,                 // 4 or 5
    assetAlloc: n++,               // 5 or 6
    disclaimer: n++,               // 6 or 7
    refs: n++,                     // 7 or 8
  };
}

// ---------------------------------------------------------------------------
// Chapter 1: 产品介绍
// ---------------------------------------------------------------------------

function buildIdentityTable(p: StockFundParams, cn: number): string {
  const rows: string[] = [];

  rows.push(`| 基金代码 | **${p.fundCode}** |`);
  rows.push(`| 基金简称 | ${p.fundName} |`);
  rows.push(`| 产品类型 | ${p.typeLabel ?? "—"} |`);
  rows.push(`| 风险等级 | ${p.riskLevel} |`);
  if (p.management) {
    rows.push(`| 基金管理人 | ${p.management} |`);
  }
  if (p.custodian) {
    rows.push(`| 基金托管人 | ${p.custodian} |`);
  }
  if (p.foundDate) {
    rows.push(`| 成立日期 | ${p.foundDate} |`);
  }
  if (p.aumYi != null) {
    const asOf = p.aumDate ?? p.navDate;
    rows.push(
      `| 基金规模 | **约 ${p.aumYi.toFixed(2)} 亿元**（${asOf}） |`,
    );
  }
  if (p.minAmount != null) {
    rows.push(`| 起投金额 | ${Number(p.minAmount).toFixed(2)} 万元 |`);
  }
  if (p.expReturn != null) {
    rows.push(`| 预期收益率 | ${p.expReturn}% |`);
  }
  if (p.return1yPct != null) {
    rows.push(`| 近一年涨跌 | **${p.return1yPct.toFixed(2)}%** |`);
  }
  if (p.maxDrawdown1yPct != null) {
    rows.push(`| 近一年最大回撤 | **${p.maxDrawdown1yPct.toFixed(2)}%** |`);
  }
  if (p.benchmarkName) {
    rows.push(`| 业绩比较基准 | ${p.benchmarkName} |`);
  }
  return `## ${cn}. 产品介绍

| 项目 | 信息 |
|------|------|
${rows.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Chapter 2: 基金经理
// ---------------------------------------------------------------------------

function buildManagerSection(
  managers?: L0FundManagerRecord[],
  cn?: number,
): string {
  const heading = cn != null ? `${cn}. 基金经理` : "基金经理";

  if (!managers || managers.length === 0) {
    return `## ${heading}

> 暂无基金经理信息。`;
  }

  const header = `| 姓名 | 任职起始 | 任职结束 |
|------|----------|----------|`;
  const rows = managers.map(
    (m) => `| ${m.name} | ${m.begin_date ?? "—"} | ${m.end_date ?? "至今"} |`,
  );

  return `## ${heading}

${[header, ...rows].join("\n")}`;
}

// ---------------------------------------------------------------------------
// Chapter 3: 投资范围（skippable）
// ---------------------------------------------------------------------------

function buildScopeSection(
  excerpt: string,
  footnote: string | undefined,
  cn: number,
): string {
  return `## ${cn}. 投资范围

> ${excerpt}${footnote ?? ""}`;
}

// ---------------------------------------------------------------------------
// Chapter 4: 费率结构
// ---------------------------------------------------------------------------

function buildFeeSection(p: StockFundParams, cn: number): string {
  const rows: string[] = [];

  if (p.managementFee != null) {
    rows.push(`| 管理费 | **${p.managementFee}% / 年** | 每日从净值计提 |`);
  }
  if (p.custodyFee != null) {
    rows.push(`| 托管费 | **${p.custodyFee}% / 年** | 同上 |`);
  }
  if (p.subscriptionMax) {
    rows.push(`| 最高认购费 | ${p.subscriptionMax} | — |`);
  }
  if (p.purchaseMax) {
    rows.push(`| 最高申购费 | ${p.purchaseMax} | — |`);
  }
  if (p.redemptionMax) {
    rows.push(`| 最高赎回费 | ${p.redemptionMax} | — |`);
  }
  if (p.salesServiceFee != null) {
    rows.push(`| 销售服务费 | **${p.salesServiceFee}% / 年** | 每日从净值计提 |`);
  }

  if (!rows.length) {
    return `## ${cn}. 费率结构

> 暂无费率数据。`;
  }

  return `## ${cn}. 费率结构

| 费用项目 | 费率 / 规则 | 备注 |
|----------|-------------|------|
${rows.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Chapter 5: 前十大重仓
// ---------------------------------------------------------------------------

function buildTopHoldingsSection(
  holdings?: L0TopHolding[],
  cn?: number,
): string {
  const heading = cn != null ? `${cn}. 前十大重仓` : "前十大重仓";

  if (!holdings || holdings.length === 0) {
    return `## ${heading}

> 暂无前十大重仓数据。`;
  }

  const rows = holdings.slice(0, 10).map((h, i) => {
    const code = h.code ? `（${h.code}）` : "";
    const value = h.market_value != null
      ? `${(h.market_value / 10000).toFixed(2)} 万元`
      : "—";
    return `| ${i + 1} | ${h.name}${code} | ${value} |`;
  });

  return `## ${heading}

| 序号 | 股票名称 | 持有市值 |
|------|----------|----------|
${rows.join("\n")}

> 完整持仓明细以基金公司最新定期报告为准。`;
}

// ---------------------------------------------------------------------------
// Chapter 6: 持仓资产比例（饼图）
// ---------------------------------------------------------------------------

function buildAssetAllocationSection(
  alloc: StockFundParams["assetAllocation"],
  cn: number,
): string {
  if (!alloc || !alloc.items.length) {
    return `## ${cn}. 持仓资产比例

> 暂无大类资产配置数据。`;
  }

  const chart = buildAssetAllocationPieChart(alloc.items, alloc.asOfDate);

  return `## ${cn}. 持仓资产比例

${chart}`;
}

// ---------------------------------------------------------------------------
// ECharts builders (self-contained)
// ---------------------------------------------------------------------------

/**
 * Ch6: 持仓资产比例饼图。
 * 输入：大类资产类别名称 + 占比（%）。
 */
function buildAssetAllocationPieChart(
  items: Array<{ name: string; pct: number }>,
  asOfDate: string,
): string {
  const data = items.map((it) => ({ value: it.pct, name: it.name }));

  const option: Record<string, unknown> = {
    title: {
      text: "持仓资产比例",
      left: "center",
      top: 8,
      textStyle: { fontSize: 15, fontWeight: 600, color: "#1e293b" },
      subtext: asOfDate,
      subtextStyle: { fontSize: 11, color: "#64748b" },
    },
    tooltip: { trigger: "item", formatter: "{b}：{c}%" },
    legend: {
      orient: "horizontal",
      bottom: 12,
      textStyle: { color: "#64748b", fontSize: 11 },
    },
    color: STOCK_ASSET_COLORS,
    series: [
      {
        name: "资产配置",
        type: "pie",
        radius: ["38%", "58%"],
        center: ["50%", "58%"],
        avoidLabelOverlap: true,
        labelLayout: { hideOverlap: true },
        data,
        label: {
          formatter: "{b}\n{c}%",
          color: "#475569",
          fontSize: 11,
          lineHeight: 14,
          alignTo: "edge",
          edgeDistance: "8%",
        },
        labelLine: {
          length: 14,
          length2: 12,
          smooth: true,
          lineStyle: { color: "#cbd5e1" },
        },
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
      },
    ],
  };

  return "```echarts\n" + JSON.stringify(option, null, 2) + "\n```";
}





// ---------------------------------------------------------------------------
// Template deps
// ---------------------------------------------------------------------------

export const stockFundTemplateDeps: TemplateDeps<StockFundParams> = {
  synChapter2: null,
  synChapter3: null,
};
