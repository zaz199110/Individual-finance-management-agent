/**
 * # 债券基金报告模板
 *
 * ## 适用范围
 * 所有 `fund_type` 包含 `"债券型"` 的纯债/产业债基金，不含可转债基金。
 * 当前自选代表：招商产业债券A（217022）。
 *
 * ## 核心产品特征
 * - 定位：固定收益类产品，追求相对稳定的票息与资本利得
 * - 风险：R2·中低风险 ~ R3·中风险，波动低于股票但高于货币
 * - 收益：来源为债券票息+价差，可用"近一年涨跌"衡量，但不宜与股票比绝对收益
 * - 持仓：利率债、信用债、产业债、存单为主，一般不投股票
 * - 人群：适合不希望承受股票波动、追求稳健回报的投资者
 *
 * ---------------------------------------------------------------------------
 * ## 硬约束（规则层，不可变）
 *
 * ### C1. 产品介绍表展示"近一年涨跌"和"近一年最大回撤"
 * 债券基金有净值波动，涨跌和回撤数据有意义。与货币基金不同。
 *
 * ### C2. 持仓标题用"前五大持仓债券"
 * 债券基金独有模块，来源为最新季报。
 */

import type {
  FundReportMarkdownResult,
} from "./template-types";

// ---------------------------------------------------------------------------
// 输入参数
// ---------------------------------------------------------------------------

export interface BondFundParams {
  // --- L0: 产品介绍 ---
  fundCode: string;
  fundName: string;
  fundType: string;
  riskLevel: string;
  navDate: string;
  ymd: string;
  dateLabel: string;
  benchmarkName?: string | null;
  return1yPct?: number | null;
  maxDrawdown1yPct?: number | null;
  /** 基金管理人（L0，缺则跳过该行） */
  management?: string | null;
  /** 基金托管人（L0，缺则跳过该行） */
  custodian?: string | null;
  /** 成立日期（L0，缺则跳过该行） */
  foundDate?: string | null;
  /** 起投金额（万元）（L0，缺则跳过该行） */
  minAmount?: number | null;
  /** 预期收益率（L0，缺则跳过该行） */
  expReturn?: number | null;

  // --- L3 规模 ---
  aumYi?: number | null;
  aumDate?: string | null;

  // --- L1 招书 ---
  scopeExcerpt: string;
  scopeFootnote?: string | null;

  // --- L1/L3 费率（逐字段，缺哪个跳过哪行） ---
  managementFee?: number | null;
  custodyFee?: number | null;
  subscriptionMax?: string | null;
  purchaseMax?: string | null;
  redemptionMax?: string | null;
  salesServiceFee?: number | null;

  // --- L3 经理 ---
  managerSection: string;

  // --- L3 持仓 ---
  top5BondHoldingsSection: string;

  // --- L3 持有人（空字符串则跳过整章） ---
  holderStructureSection: string;

  // --- 脚注 ---
  footnotesMarkdown: string;
  citeSection: string;
}

// ---------------------------------------------------------------------------
// 模板主函数
// ---------------------------------------------------------------------------

export function buildBondFundReportMarkdown(
  params: BondFundParams,
): FundReportMarkdownResult {
  const identityRows = buildBondFundIdentityRows(params);
  const productIdentitySection = `| 项目 | 信息 |\n|------|------|\n${identityRows.rows}`;

  const feeSection = buildBondFeeRows(params);

  const trimmedScope = params.scopeExcerpt.trim();
  const scopeChapter = trimmedScope
    ? `## 投资范围\n\n${trimmedScope
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}${params.scopeFootnote ?? ""}\n\n`
    : "";

  const hasHolderData = params.holderStructureSection.length > 0;
  const holderChapter = hasHolderData
    ? `## 持有人结构\n\n${params.holderStructureSection}\n\n`
    : "";

  const hasBondHoldings = params.top5BondHoldingsSection.trim().length > 0;
  const holdingsChapter = hasBondHoldings
    ? `## 前五大持仓债券\n\n${params.top5BondHoldingsSection}\n\n`
    : "";

  const footnotesBody = params.footnotesMarkdown.trim();
  const referenceChapter = footnotesBody
    ? `${footnotesBody}\n\n${params.citeSection}`
    : params.citeSection;

  const markdown = `# ${params.fundCode}-${params.fundName}-基金解读-${params.ymd}

*为您生成 · ${params.dateLabel}*  
*行情与净值数据截至 **${params.navDate}**（最近一个交易日）*

---

## 产品介绍

${productIdentitySection}

## 基金经理

${params.managerSection}

${scopeChapter}## 费率结构

${feeSection}

${holdingsChapter}${holderChapter}## 温馨提示

本报告由系统根据公开信息与入库披露整理，**仅供参考**，不构成任何投资建议或收益承诺。基金过往业绩不预示未来表现，投资须自担风险。

${referenceChapter}
`;

  return {
    markdown,
    chartCount: hasHolderData ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function buildBondFundIdentityRows(params: BondFundParams): {
  rows: string;
} {
  const rows: string[] = [
    `| 基金代码 | **${params.fundCode}** |`,
    `| 基金简称 | ${params.fundName} |`,
    `| 产品类型 | ${params.fundType} |`,
    `| 风险等级 | ${params.riskLevel} |`,
  ];

  if (params.management) {
    rows.push(`| 基金管理人 | ${params.management} |`);
  }
  if (params.custodian) {
    rows.push(`| 基金托管人 | ${params.custodian} |`);
  }
  if (params.foundDate) {
    rows.push(`| 成立日期 | ${params.foundDate} |`);
  }
  if (params.aumYi != null) {
    const asOf = params.aumDate ?? params.navDate;
    rows.push(
      `| 基金规模 | **约 ${params.aumYi.toFixed(2)} 亿元**（${asOf}） |`,
    );
  }
  if (params.minAmount != null) {
    rows.push(`| 起投金额 | ${params.minAmount.toFixed(2)} 万元 |`);
  }
  if (params.expReturn != null) {
    rows.push(`| 预期收益率 | **${params.expReturn.toFixed(2)}%** |`);
  }
  if (params.return1yPct != null) {
    rows.push(`| 近一年涨跌 | **${params.return1yPct.toFixed(2)}%** |`);
  }
  if (params.maxDrawdown1yPct != null) {
    rows.push(
      `| 近一年最大回撤 | **${params.maxDrawdown1yPct.toFixed(2)}%** |`,
    );
  }
  if (params.benchmarkName) {
    rows.push(`| 业绩比较基准 | ${params.benchmarkName} |`);
  }

  return { rows: rows.join("\n") };
}

function buildBondFeeRows(params: BondFundParams): string {
  const rows: string[] = [];

  if (params.managementFee != null) {
    rows.push(
      `| 管理费 | **${params.managementFee.toFixed(2)}%/年** | 每日从净值计提 |`,
    );
  }
  if (params.custodyFee != null) {
    rows.push(
      `| 托管费 | **${params.custodyFee.toFixed(2)}%/年** | 每日从净值计提 |`,
    );
  }
  if (params.subscriptionMax) {
    rows.push(`| 最高认购费 | ${params.subscriptionMax} | — |`);
  }
  if (params.purchaseMax) {
    rows.push(`| 最高申购费 | ${params.purchaseMax} | — |`);
  }
  if (params.redemptionMax) {
    rows.push(`| 最高赎回费 | ${params.redemptionMax} | — |`);
  }
  if (params.salesServiceFee != null) {
    const label =
      params.salesServiceFee === 0
        ? "**0.00%/年**"
        : `**${params.salesServiceFee.toFixed(2)}%/年**`;
    rows.push(`| 销售服务费 | ${label} | 每日从净值计提 |`);
  }

  if (rows.length === 0) return "";

  return `| 费用项目 | 费率/规则 | 备注 |\n|----------|-----------|------|\n${rows.join("\n")}`;
}

