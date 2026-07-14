/**
 * 货币基金报告模板 (v4.0 · 7章 · 完全自包含)
 *
 * 适用范围: 所有 fund_type 包含 "货币型" 的基金
 * 当前自选代表: 天弘余额宝货币（000198）
 *
 * 本章节结构 (7章):
 *   1. 产品介绍      — 身份表 + 规模/万份收益/七日年化
 *   2. 基金经理      — 经理详表
 *   3. 投资范围      — LLM 一句话总结
 *   4. 费率结构      — 管理费/托管费/销售服务费/申购/赎回
 *   5. 资产配置      — ECharts 饼图（L1 季报明细分类）
 *   6. 温馨提示      — 风险提示 + 免责声明
 *   7. 引用说明      — 统一引用表（基金产品资料概要 / 最新季报）
 *
 * ## 硬约束
 * - C1: 禁止展示"近一年涨跌"和"近一年最大回撤"
 * - C2: 禁止"这只基金适合我吗"整章（无决策清单、无图表）
 * - C5/C6/C7: 禁用"赚不赚钱""长期持有""是否适合X年以上配置"等权益化表述
 * - C8: 完全自包含，不依赖任何共有模块
 */

import type { FundReportMarkdownResult, TemplateDeps } from "./template-types";
import type { L0FundManagerRecord, L0FundShareSnapshot } from "@/lib/l0/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 货币基金资产配置饼图色板 — 按资产类别对应 */
const MM_ASSET_COLORS = [
  "#22c55e", // 银行存款
  "#3b82f6", // 债券
  "#8b5cf6", // 同业存单
  "#f59e0b", // 买入返售金融资产
  "#06b6d4", // 其他金融资产
  "#ec4899",
  "#94a3b8",
  "#f97316",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MoneyMarketParams {
  // ── Chapter 1: 产品介绍 ──
  fundCode: string;
  fundName: string;
  typeLabel?: string;          // fund_basic.type standalone（如"货币型"）
  riskLevel: string;
  aumYi?: number;              // 基金规模（亿元）
  aumDate?: string;            // 规模截止日期
  investType?: string;         // fund_basic.invest_type standalone
  minAmount?: number;          // 起点金额（万元）
  expReturn?: number;          // 预期收益率
  benchmarkName?: string;      // 业绩比较基准
  foundDate?: string;          // 成立日期
  dailyIncomePer10k?: number;  // 万份收益（元）
  yield7dAnnual?: number;      // 七日年化（%）
  navDate: string;             // "2026-06-23"
  ymd: string;                 // "20260624"
  dateLabel: string;           // "2026年6月24日"

  // ── Chapter 2: 基金经理 ──
  fundManagers?: L0FundManagerRecord[];

  // ── Chapter 3: 投资范围 ──
  scopeExcerpt?: string;       // LLM 一句话总结（≤60字）
  scopeFootnote?: string;      // 脚注标记，如 "[^1]"

  // ── Chapter 4: 费率结构 ──
  feeSectionBody: string;      // 费率表格（含脚注标记）
  novaultNote: string;         // 非金库数据提示

  // ── Chapter 5: 资产配置 ──
  assetAllocation?: {
    items: Array<{ name: string; pct: number }>;
    asOfDate: string;          // 如 "2025年第三季度"
    footnote?: string;         // 脚注标记，如 "[^2]"
  };

  // ── Chapter 7: 引用说明 ──
  referenceChapter: string;    // 完整 Ch8 引用表 Markdown
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function buildMoneyMarketReportMarkdown(
  params: MoneyMarketParams,
): FundReportMarkdownResult {
  const identityTable = buildIdentityTable(params);
  const managerTable = buildManagerTable(params.fundManagers);
  const scopeBlock = buildScopeBlock(params.scopeExcerpt, params.scopeFootnote);
  const allocSection = buildAssetAllocationSection(params.assetAllocation);
  const chartCount = params.assetAllocation?.items?.length ? 1 : 0;

  const markdown = `# ${params.fundCode}-${params.fundName}-基金解读-${params.ymd}

*为您生成 · ${params.dateLabel}*
*行情与净值数据截至 **${params.navDate}**（最近一个交易日）*

---

${identityTable}

---

${managerTable}

---

${scopeBlock}

---

## 费率结构

${params.novaultNote}
${params.feeSectionBody}

---

${allocSection}

---

## 温馨提示

本报告由系统根据公开信息与入库披露整理，**仅供参考**，不构成任何投资建议或收益承诺。基金过往业绩不预示未来表现，投资须自担风险。

---

${params.referenceChapter}

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;

  return { markdown, chartCount };
}

// ---------------------------------------------------------------------------
// Chapter builders
// ---------------------------------------------------------------------------

/**
 * Ch1: 产品身份表。
 * 字段按固定顺序排列，有数据则展示，无数据则跳过。
 */
function buildIdentityTable(p: MoneyMarketParams): string {
  const rows: string[] = [];

  rows.push(`| 基金代码 | **${p.fundCode}** |`);
  rows.push(`| 基金简称 | ${p.fundName} |`);
  rows.push(`| 产品类型 | ${p.typeLabel ?? "—"} |`);
  rows.push(`| 风险等级 | ${p.riskLevel} |`);

  if (p.aumYi != null) {
    const asOf = p.aumDate ?? p.navDate;
    rows.push(`| 基金规模 | **约 ${p.aumYi.toFixed(2)} 亿元**（${asOf}） |`);
  }
  if (p.investType) {
    rows.push(`| 投资风格 | ${p.investType} |`);
  }
  if (p.minAmount != null) {
    rows.push(`| 起点金额 | ${Number(p.minAmount).toFixed(2)} 万元 |`);
  }
  if (p.expReturn != null) {
    rows.push(`| 预期收益率 | ${p.expReturn}% |`);
  }
  if (p.benchmarkName) {
    rows.push(`| 业绩比较基准 | ${p.benchmarkName} |`);
  }
  if (p.foundDate) {
    rows.push(`| 成立日期 | ${p.foundDate} |`);
  }
  if (p.dailyIncomePer10k != null) {
    rows.push(`| 万份收益 | **${p.dailyIncomePer10k.toFixed(4)} 元** |`);
  }
  if (p.yield7dAnnual != null) {
    rows.push(`| 七日年化 | **${p.yield7dAnnual.toFixed(4)}%** |`);
  }

  return `## 产品介绍

| 项目 | 信息 |
|------|------|
${rows.join("\n")}`;
}

/**
 * Ch2: 基金经理详表。
 * 有经理数据时：逐行列出行名、任职起始、任职结束。
 * 无数据时：展示降级文案。
 */
function buildManagerTable(managers?: L0FundManagerRecord[]): string {
  if (!managers || managers.length === 0) {
    return `## 基金经理

> 暂无基金经理信息。`;
  }

  const header = `| 姓名 | 任职起始 | 任职结束 |
|------|----------|----------|`;
  const rows = managers.map(
    (m) => `| ${m.name} | ${m.begin_date ?? "—"} | ${m.end_date ?? "至今"} |`,
  );

  return `## 基金经理

${[header, ...rows].join("\n")}`;
}

/**
 * Ch3: 投资范围。
 * 有 scopeExcerpt 时：展示 LLM 一句话总结 + 可选脚注。
 * 无数据时：展示通用货币市场工具描述。
 */
function buildScopeBlock(excerpt?: string, footnote?: string): string {
  if (excerpt) {
    return `## 投资范围

> ${excerpt}${footnote ?? ""}`;
  }
  return `## 投资范围

> 本基金投资于货币市场工具，包括现金、期限在1年以内的银行存款、债券回购、中央银行票据、同业存单，以及剩余期限在397天以内的债券等。`;
}

/**
 * Ch5: 资产配置。
 * 有数据时：展示 ECharts 饼图 + 来源说明。
 * 无数据时：展示降级文案。
 */
function buildAssetAllocationSection(
  alloc?: MoneyMarketParams["assetAllocation"],
): string {
  if (!alloc || !alloc.items.length) {
    return `## 资产配置

> 暂无季报资产配置明细数据。`;
  }

  const chart = buildAssetAllocationPieChart(alloc.items, alloc.asOfDate);
  const footnote = alloc.footnote ? ` ${alloc.footnote}` : "";

  return `## 资产配置

${chart}

*数据来源：基金定期报告（${alloc.asOfDate}）· 占基金总资产比例${footnote}*`;
}

// ---------------------------------------------------------------------------
// ECharts (self-contained — no shared module dependency)
// ---------------------------------------------------------------------------

/**
 * 构建货币基金资产配置饼图。
 *
 * 输入：L1 季报明细分类（如 银行存款、债券、同业存单 等），每个类别有名称和占比。
 * 输出：````echarts` 栅栏块，供前端渲染。
 */
function buildAssetAllocationPieChart(
  items: Array<{ name: string; pct: number }>,
  asOfDate: string,
): string {
  const data = items.map((it) => ({ value: it.pct, name: it.name }));

  const option: Record<string, unknown> = {
    title: {
      text: "资产配置结构",
      subtext: `${asOfDate} · 占基金总资产比例`,
      left: "center",
      top: 8,
      itemGap: 6,
      textStyle: { fontSize: 15, fontWeight: 600, color: "#1e293b" },
      subtextStyle: { fontSize: 11, color: "#64748b", lineHeight: 16 },
    },
    tooltip: { trigger: "item", formatter: "{b}：{c}%" },
    legend: {
      orient: "horizontal",
      bottom: 12,
      textStyle: { color: "#64748b", fontSize: 11 },
    },
    color: MM_ASSET_COLORS,
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

export const moneyMarketTemplateDeps: TemplateDeps<MoneyMarketParams> = {
  synChapter2: null,
  synChapter3: null,
};
