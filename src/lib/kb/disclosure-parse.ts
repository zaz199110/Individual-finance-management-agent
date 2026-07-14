import type { FundFeeRule } from "@/lib/l0/types";

/** 对客禁止出现的 gather 占位符 */
export const DISCLOSURE_PLACEHOLDERS = [
  "（请查阅产品资料概要投资范围）",
  "（请查阅招募说明书费率章节）",
  "（请查阅风险揭示章节）",
] as const;

export function isDisclosurePlaceholder(text: string | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return true;
  return DISCLOSURE_PLACEHOLDERS.some((p) => t === p || t.startsWith(p));
}

export interface ParsedFeeRates {
  management_pct?: number;
  custody_pct?: number;
  sales_service_pct?: number;
  subscription_max_pct?: number;
}

/** Tushare fund_basic.management 等 L0 费率字段 → 百分比 */
export function parseL0FeeRatesFromBasic(input: {
  management?: string | number | null;
}): ParsedFeeRates {
  if (input.management == null || !String(input.management).trim()) {
    return {};
  }
  const n = Number.parseFloat(String(input.management).trim().replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return {};
  return sanitizeParsedFeeRates({ management_pct: n });
}

const FEE_BOUNDS: Record<keyof ParsedFeeRates, { min: number; max: number }> = {
  management_pct: { min: 0.05, max: 2.5 },
  custody_pct: { min: 0.01, max: 0.5 },
  sales_service_pct: { min: 0, max: 1 },
  subscription_max_pct: { min: 0, max: 2 },
};

/** 排除「基金管理费/基金托管费」误匹配到资产配置比例等场景 */
const MGMT_FEE_RE = /(?<![基金])管理(?:费)[率]?/;
const CUSTODY_FEE_RE = /(?<![基金])托管(?:费)[率]?/;

function firstRateMatch(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] != null) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function isPlausibleFee(key: keyof ParsedFeeRates, value: number): boolean {
  const bounds = FEE_BOUNDS[key];
  return value >= bounds.min && value <= bounds.max;
}

/** 剔除明显误解析的费率（如把 60% 资产配置当成管理费） */
export function sanitizeParsedFeeRates(fees: ParsedFeeRates): ParsedFeeRates {
  const out: ParsedFeeRates = {};
  for (const key of Object.keys(FEE_BOUNDS) as (keyof ParsedFeeRates)[]) {
    const value = fees[key];
    if (value != null && isPlausibleFee(key, value)) {
      out[key] = value;
    }
  }
  return out;
}

/** 从披露文本/联网摘要中提取费率（支持招募书长句、表格换行、全角百分号等） */
export function parseFeeRatesFromText(text: string): ParsedFeeRates {
  const normalized = text.replace(/％/g, "%").replace(/\s+/g, " ");
  const rates: ParsedFeeRates = {};

  rates.management_pct = firstRateMatch(normalized, [
    new RegExp(`${MGMT_FEE_RE.source}[：:为]?\\s*([\\d.]+)\\s*%`),
    new RegExp(`${MGMT_FEE_RE.source}\\s+([\\d.]+)\\s*%`),
    /\|\s*管理费\s*\|\s*\*?\*?([\d.]+)\s*%\*?\*?/,
    new RegExp(`${MGMT_FEE_RE.source}[^0-9%]{0,16}([\\d.]+)\\s*%`),
  ]);
  rates.custody_pct = firstRateMatch(normalized, [
    new RegExp(`${CUSTODY_FEE_RE.source}[：:为]?\\s*([\\d.]+)\\s*%`),
    new RegExp(`${CUSTODY_FEE_RE.source}\\s+([\\d.]+)\\s*%`),
    /\|\s*托管费\s*\|\s*\*?\*?([\d.]+)\s*%\*?\*?/,
    new RegExp(`${CUSTODY_FEE_RE.source}[^0-9%]{0,16}([\\d.]+)\\s*%`),
  ]);
  rates.sales_service_pct = firstRateMatch(normalized, [
    /销售服务(?:费)?[^0-9%]{0,32}([\d.]+)\s*%/,
    /销售服务(?:费)?[：:为]?\s*([\d.]+)\s*%/,
  ]);
  rates.subscription_max_pct = firstRateMatch(normalized, [
    /申购(?:费)?[^0-9%]{0,32}(?:最高)?[^0-9%]{0,8}([\d.]+)\s*%/,
    /申购(?:费)?[：:为]?\s*(?:最高)?[^0-9%]{0,8}([\d.]+)\s*%/,
  ]);

  return sanitizeParsedFeeRates(rates);
}

export function hasCompleteCoreFees(fees: ParsedFeeRates): boolean {
  return fees.management_pct != null && fees.custody_pct != null;
}

export function mergeFeeRates(...sources: ParsedFeeRates[]): ParsedFeeRates {
  const out: ParsedFeeRates = {};
  for (const src of sources) {
    if (src.management_pct != null) out.management_pct = src.management_pct;
    if (src.custody_pct != null) out.custody_pct = src.custody_pct;
    if (src.sales_service_pct != null) out.sales_service_pct = src.sales_service_pct;
    if (src.subscription_max_pct != null) {
      out.subscription_max_pct = src.subscription_max_pct;
    }
  }
  return out;
}

function formatPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/** 格式化赎回费规则为横排文本，如 "< 7天 1.5% ｜ ≥ 7天 0.5%" */
export function renderRedemptionFee(rules: FundFeeRule[]): string | null {
  const redemptionRules = rules.filter((r) => /卖出|赎回/.test(r.kind));
  if (!redemptionRules.length) return null;
  return redemptionRules
    .map((r) => (r.condition ? `${r.condition} ${formatPct(r.fee)}%` : `${formatPct(r.fee)}%`))
    .join(" ｜ ");
}

/** C 端费率一览表（RPT-FORMAT-01 · 费用怎么算） */
export function formatCustomerFeeTable(fees: ParsedFeeRates): string | null {
  const safe = sanitizeParsedFeeRates(fees);
  if (!hasCompleteCoreFees(safe)) return null;

  const rows = [
    "| 费用项目 | 费率 / 规则 | 备注 |",
    "|----------|-------------|------|",
    `| 管理费 | **${formatPct(safe.management_pct!)}% / 年** | 每日从净值计提，无需另行支付 |`,
    `| 托管费 | **${formatPct(safe.custody_pct!)}% / 年** | 同上 |`,
  ];
  if (safe.sales_service_pct != null) {
    rows.push(
      `| 销售服务费 | **${formatPct(safe.sales_service_pct)}% / 年** | 部分份额类别（如 C 类）收取 |`,
    );
  }
  if (safe.subscription_max_pct != null) {
    rows.push(
      `| 申购费 | 最高 **${formatPct(safe.subscription_max_pct)}%** | 通常随申购金额递减；以销售平台为准 |`,
    );
  } else {
    rows.push("| 申购费 | 以销售平台为准 | 不同渠道规则可能不同 |");
  }
  // 尝试使用动态赎回费规则，否则 fallback 到默认文案
  const redemptionFeeRule = (globalThis as Record<string, unknown>).__fundFeeRules as FundFeeRule[] | undefined;
  const redemptionFeeText = redemptionFeeRule ? renderRedemptionFee(redemptionFeeRule) : null;
  rows.push(
    redemptionFeeText
      ? `| 赎回费 | **${redemptionFeeText}** | 以最新招募说明书为准 |`
      : "| 赎回费 | 见招募说明书 | 持有越久，多数产品赎回费越低 |",
  );
  return rows.join("\n");
}

export function formatHoldingCostEstimate(fees: ParsedFeeRates): string | null {
  const safe = sanitizeParsedFeeRates(fees);
  if (!hasCompleteCoreFees(safe)) return null;

  const parts = [safe.management_pct!, safe.custody_pct!];
  if (safe.sales_service_pct != null) parts.push(safe.sales_service_pct);
  const total = Number(parts.reduce((a, b) => a + b, 0).toFixed(2));
  const breakdown = parts.map((p) => `${formatPct(p)}%`).join(" + ");

  return [
    "#### 持有成本粗算（持满 1 年 · 示意）",
    "",
    "| 项目 | 粗算 |",
    "|------|------|",
    `| 管理费 + 托管费${safe.sales_service_pct != null ? " + 销售服务费" : ""} | **约 ${formatPct(total)}% / 年**（${breakdown}） |`,
    "| 说明 | **不含** 申购/赎回费与买卖价差；实际以确认日净值与合同为准 |",
    "",
    "**小提示：** 运作费每日从基金资产计提，反映在您看到的净值里；中长期持有通常比频繁申赎更省成本。",
  ].join("\n");
}

export function formatMissingFeeFallback(): string {
  return [
    "**一句话：** 管理费、托管费等运作费用 **每日从基金资产中计提**，会反映在单位净值里，申购/赎回时 **不会单独再收一笔**。",
    "",
    "| 费用项目 | 说明 |",
    "|----------|------|",
    "| 管理费 / 托管费 | 公开检索 **暂未解析到具体数字**，请以 **最新招募说明书 / 产品资料概要** 为准 |",
    "| 申购 / 赎回费 | 以您使用的 **销售平台规则** 为准 |",
  ].join("\n");
}

export function formatMissingCostFallback(): string {
  return [
    "公开披露中 **暂未解析到完整费率**，无法给出可靠的持有成本粗算。",
    "",
    "建议您查阅 **产品资料概要** 中的「基金运作相关费用」，或在销售平台查看申购/赎回规则后再决策。",
  ].join("\n");
}

const WEB_PORTAL_JUNK_RE =
  /新浪(?:网)?|天天基金(?:网)?|基金一览|净值走势图|流水号\s*\d|财经纵横|基金排行|点击查看|查看更多|_新浪网/i;

/** 门户网站列表页/导航垃圾，不宜直接进入对客报告 */
export function isWebPortalJunk(text: string | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t) return false;
  if (WEB_PORTAL_JUNK_RE.test(t)) return true;
  const navHits = (t.match(/[·•]\s*[^·•]{2,12}/g) ?? []).length;
  return navHits >= 4 && t.length > 180 && !/投资目标/.test(t.slice(0, 120));
}

/** 披露摘录质量分：结构化招募书摘要 > 门户垃圾 */
export function scoreDisclosureExcerpt(text: string): number {
  const t = text.trim();
  if (!t || isDisclosurePlaceholder(t)) return -1000;
  if (isWebPortalJunk(t)) return -500;

  let score = Math.min(t.length, 360);
  if (/投资目标/.test(t)) score += 90;
  if (/投资范围|主要投资于/.test(t)) score += 90;
  if (/产品资料概要|基金产品概况/.test(t)) score += 50;
  if (/发布时间[：:]\s*\d{4}-\d{2}-\d{2}/.test(t)) score += 25;
  if (/管理费|托管费/.test(t) && !/投资范围/.test(t)) score += 40;
  if (t.length > 900) score -= 120;
  if (/每份累计[\d.]+元/.test(t)) score -= 80;
  return score;
}

export function pickBestDisclosureExcerpt(
  snippets: string[],
  minLength = 24,
): string {
  const ranked = [...snippets]
    .map((s) => s.trim())
    .filter((s) => s.length >= minLength && !isDisclosurePlaceholder(s))
    .sort((a, b) => scoreDisclosureExcerpt(b) - scoreDisclosureExcerpt(a));
  return ranked[0] ?? "";
}

export function pickBestExcerpt(snippets: string[], minLength = 24): string {
  const best = pickBestDisclosureExcerpt(snippets, minLength);
  if (best) return best;
  const sorted = [...snippets]
    .map((s) => s.trim())
    .filter((s) => s.length >= minLength && !isDisclosurePlaceholder(s))
    .sort((a, b) => b.length - a.length);
  return sorted[0] ?? "";
}

/** 截断门户导航尾巴，保留披露正文 */
export function truncateAtPortalJunk(text: string): string {
  const markers = [
    "新浪网",
    "天天基金",
    "流水号",
    "基金一览",
    "净值走势图",
    "财经纵横",
    "基金排行",
  ];
  let cut = text.length;
  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx >= 0) cut = Math.min(cut, idx);
  }
  return text.slice(0, cut).trim();
}

export function parseFeeRatesFromSnippets(snippets: string[]): ParsedFeeRates {
  return mergeFeeRates(...snippets.map((s) => parseFeeRatesFromText(s)));
}

/** 从表格单元格中解析百分比数值（支持 "45.23%" 和纯数字 "45.23"） */
function parsePctCell(cell: string): number | undefined {
  const cleaned = cell.replace(/\*/g, "").replace(/,/g, "").trim();
  // 优先匹配带 % 的格式
  let m = cleaned.match(/([\d.]+)\s*%/);
  if (m?.[1]) {
    const n = Number.parseFloat(m[1]);
    if (Number.isFinite(n)) return n;
  }
  // 回退：匹配纯数字（占比列可能不含 % 符号）
  m = cleaned.match(/^([\d.]+)$/);
  if (m?.[1]) {
    const n = Number.parseFloat(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  return undefined;
}

function classifyAssetRowLabel(label: string): keyof import("@/lib/l0/registry-portfolio").L0AssetAllocation | null {
  if (/地区|行业分布|序号/.test(label)) return null;
  if (/股票|权益/.test(label) && !/债券/.test(label)) return "stock_pct";
  if (/债券|存单|转债/.test(label) && !/银行/.test(label)) return "bond_pct";
  if (/银行存款|清算备付|现金|备付金/.test(label)) return "cash_pct";
  if (/etf|黄金|目标|基金投资|衍生品|其他|贵金属/i.test(label)) return "other_pct";
  return null;
}

/** 从季报「资产组合」表格解析大类配置（ASSET-01 · L1-V） */
export function parseAssetAllocationFromText(text: string): import("@/lib/l0/registry-portfolio").L0AssetAllocation | null {
  if (!/资产组合|占基金总资产比例/.test(text)) return null;

  const section = text.match(/资产组合[\s\S]{0,2500}?(?=\n## |\n# |$)/)?.[0] ?? text;
  const alloc: import("@/lib/l0/registry-portfolio").L0AssetAllocation = {};

  for (const line of section.split("\n")) {
    if (!/^\|/.test(line) || /^[\|\s\-:]+$/.test(line)) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length < 2) continue;
    const label = cols[0]!;
    if (/资产类别|项目|序号|------/.test(label)) continue;

    const pct =
      parsePctCell(cols[cols.length - 1]!) ?? parsePctCell(cols[1]!);
    if (pct == null) continue;

    const key = classifyAssetRowLabel(label);
    if (!key) continue;
    alloc[key] = (alloc[key] ?? 0) + pct;
  }

  const has = [alloc.stock_pct, alloc.bond_pct, alloc.cash_pct, alloc.other_pct].some(
    (v) => v != null && v > 0,
  );
  return has ? alloc : null;
}

export function parseAssetAllocationFromSnippets(
  snippets: string[],
): import("@/lib/l0/registry-portfolio").L0AssetAllocation | null {
  let best: import("@/lib/l0/registry-portfolio").L0AssetAllocation | null = null;
  let bestTotal = 0;
  for (const s of snippets) {
    const parsed = parseAssetAllocationFromText(s);
    if (!parsed) continue;
    const total = [parsed.stock_pct, parsed.bond_pct, parsed.cash_pct, parsed.other_pct].reduce(
      (sum: number, v) => sum + (v ?? 0),
      0,
    ) as number;
    if (total > bestTotal) {
      best = parsed;
      bestTotal = total;
    }
  }
  return best;
}

export function extractAssetAllocationFromL1Hits(
  hits: Array<{ heading: string; excerpt: string; doc_type?: string; file_path?: string }>,
): import("@/lib/l0/registry-portfolio").L0AssetAllocation | null {
  const snippets = hits
    .filter(
      (h) =>
        h.doc_type === "quarterly_report" ||
        /资产组合|占基金总资产比例/.test(`${h.heading}${h.excerpt}${h.file_path ?? ""}`),
    )
    .map((h) => h.excerpt);
  return parseAssetAllocationFromSnippets(snippets);
}

export function buildL3FailureMessage(reason: string): string {
  return (
    `无法完成基金解读报告：联网检索未返回可用结果（${reason}）。` +
    `请在 **设置 → 模型 → 联网搜索** 中更换 search engine（如智谱 Search-Std）或检查 API Key 后重试。`
  );
}

/** 非联网失败（本地 vault 解析、结构化校验等）的对客文案 */
export function buildGatherFailureMessage(
  reason: string,
  source: "l1" | "parse" | "l3" = "parse",
): string {
  if (source === "l1") {
    return (
      `无法完成基金解读报告：本地基金知识库资料校验未通过（${reason}）。` +
      `请确认该基金已在 **基金知识库** 完成索引，或稍后重试；若仍失败可尝试重新生成报告。`
    );
  }
  if (source === "parse") {
    return (
      `无法完成基金解读报告：资料检索已完成，但未能提取完整费率（${reason}）。` +
      `这通常不是 API Key 问题；请 **重新生成报告** 一次，或在 **基金知识库** 确认该产品资料概要/年报已入库。`
    );
  }
  return buildL3FailureMessage(reason);
}

// ── 行业配置 & 持有人结构 L1 表解析 ──

/** 从 Markdown 表格行中拆出列（去掉首尾空串） */
function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** 在表头列中查找匹配指定模式的第一列索引；未找到返回 -1 */
function findColIndex(cols: string[], patterns: RegExp[]): number {
  for (const pat of patterns) {
    const idx = cols.findIndex((c) => pat.test(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 从 "YYYY-MM-DD" 推导 "2026Q1" 格式的期间标识 */
function deriveSourcePeriod(sourceAsOf: string | undefined): string | undefined {
  if (!sourceAsOf) return undefined;
  // 2026-03-31 → 2026Q1
  const m = sourceAsOf.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return undefined;
  const year = m[1]!;
  const month = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return undefined;
  const quarter = Math.ceil(month / 3);
  return `${year}Q${quarter}`;
}

/** 从 "YYYY" 或 "2025-annual-report" 推导 as_of / as_of_label */
export function deriveReportDateAndLabel(
  fileName: string,
): { as_of: string; as_of_label: string } | undefined {
  // 匹配 "2025-annual-report" 或 "2025-semi-annual-report" 格式
  const m = fileName.match(/^(\d{4})-(annual|semi.annual)/);
  if (!m) {
    // 回退：匹配 "quarterly_report/2026Q2-quarterly-report" 格式
    const qm = fileName.match(/(\d{4}Q\d)/);
    if (!qm) return undefined;
    return { as_of: qm[1]!, as_of_label: `${qm[1]!} 季报` };
  }
  const year = m[1]!;
  const kind = m[2]!.includes("semi") ? "半年报" : "年报";
  const as_of = `${year}-12-31`;
  return { as_of, as_of_label: `${year}年${kind}` };
}

/** 从年报/半年报「持有人结构」表格解析持有人信息（HOLDER-01） */
export function parseHolderStructureFromText(text: string): {
  individual_pct: number;
  institution_pct: number;
  internal_pct?: number;
} | null {
  if (!/持有人结构|持有人类型/.test(text)) return null;

  const section =
    text.match(/持有人结构[\s\S]{0,1200}?(?=\n## |\n# |$)/)?.[0] ?? text;

  let individual_pct: number | null = null;
  let institution_pct: number | null = null;
  let internal_pct: number | undefined = undefined;

  for (const line of section.split("\n")) {
    if (!/^\|/.test(line) || /^[\|\s\-:]+$/.test(line)) continue;
    const cols = splitTableRow(line);
    if (cols.length < 2) continue;
    if (/持有人类型|占比|说明|------/.test(cols[0]!)) continue;

    const pct = parsePctCell(cols[1]!) ?? parsePctCell(cols[0]!);
    if (pct == null) continue;

    if (/机构/.test(cols[0]!)) {
      institution_pct = pct;
    } else if (/个人|散户/.test(cols[0]!)) {
      individual_pct = pct;
    } else if (/内部/.test(cols[0]!)) {
      internal_pct = pct;
    }
  }

  if (individual_pct == null || institution_pct == null) return null;
  return { individual_pct, institution_pct, internal_pct };
}

