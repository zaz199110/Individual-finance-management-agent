import fs from "node:fs";
import { sanitizeCustomerFacingText } from "@/lib/fund/customer-copy";
import {
  formatCustomerFeeTable,
  formatMissingFeeFallback,
  isWebPortalJunk,
  parseFeeRatesFromText,
  sanitizeParsedFeeRates,
  truncateAtPortalJunk,
} from "@/lib/kb/disclosure-parse";

const SYSTEM_DISCLAIMER =
  "*以上内容由AI基于您提供的信息生成，仅供参考，不构成投资建议。*";

const PROSPECTUS_MARKERS =
  /产品资料概要|编制日期|送出日期|招募说明书|基金产品概况|基金基本概况|重要提示|第\s*\d+\s*页\s*共/i;

const MANUAL_HEADING_NUM =
  /^(\#{2,6}\s+)(?:[一二三四五六七八九十百]+[、．.]|[（(][一二三四五六七八九十\d]+[)）][、．.\s]*|\d+(?:\.\d+){0,4}[、．.\s]+)/;

const CHAPTER_ANSWER_EXEMPT = new Set([
  "需求速览",
  "方案速览",
  "报告说明",
  "温馨提示",
  "合规与说明",
  "引用",
  "延伸阅读",
  "参考来源",
  "公开资讯补充",
  "一、基础信息",
  "三、AI建议",
  "二、投资场景",
  "四、合规提示",
]);

interface CodeFence {
  placeholder: string;
  content: string;
}

/** 草稿生成后统一润色：C 端友好 · 去重 · 格式规范（RPT-FORMAT-01 / RPT-HEADING-NUM-01） */
export function polishReportMarkdown(markdown: string): string {
  const { protectedMd, fences } = protectCodeFences(markdown);
  let md = protectedMd;

  md = stripManualHeadingNumbers(md);
  md = normalizeHeadingDepth(md);
  md = mergeDuplicateInvestmentScope(md);
  md = ensureChapterSeparators(md);
  md = polishDisclosureSections(md);
  md = dedupeParagraphs(md);
  md = sanitizePlainText(md);
  md = ensureSystemDisclaimer(md);
  md = collapseWhitespace(md);

  return restoreCodeFences(md, fences);
}

export function polishDraftReportFile(draftPath: string): boolean {
  if (!fs.existsSync(draftPath)) return false;
  const raw = fs.readFileSync(draftPath, "utf8");
  const polished = polishReportMarkdown(raw);
  if (polished === raw) return false;
  fs.writeFileSync(draftPath, polished, "utf8");
  return true;
}

function protectCodeFences(md: string): {
  protectedMd: string;
  fences: CodeFence[];
} {
  const fences: CodeFence[] = [];
  const protectedMd = md.replace(/```[\s\S]*?```/g, (block) => {
    const placeholder = `__RPT_CODE_FENCE_${fences.length}__`;
    fences.push({ placeholder, content: block });
    return placeholder;
  });
  return { protectedMd, fences };
}

function restoreCodeFences(md: string, fences: CodeFence[]): string {
  let result = md;
  for (const fence of fences) {
    result = result.replace(fence.placeholder, fence.content);
  }
  return result;
}

/** RPT-HEADING-NUM-01：去掉标题行手写序号，Preview 由 CSS 自动编号 */
export function stripManualHeadingNumbers(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (!/^#{2,6}\s/.test(line)) return line;
      return line.replace(MANUAL_HEADING_NUM, "$1");
    })
    .join("\n");
}

/** 标题最深 5 级（######） */
function normalizeHeadingDepth(md: string): string {
  return md.replace(/^#{7,}(\s)/gm, "######$1");
}

/** 每个 ## 章之前补 ---（开篇块除外） */
export function ensureChapterSeparators(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let seenH2 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^## /.test(line) && !/^## #/.test(line)) {
      if (seenH2) {
        const prev = out[out.length - 1]?.trim() ?? "";
        if (prev !== "---") {
          if (prev !== "") out.push("");
          out.push("---");
        }
      }
      seenH2 = true;
    }
    out.push(line);
  }
  return out.join("\n");
}

function polishDisclosureSections(md: string): string {
  const handlers: Record<string, (body: string) => string> = {
    投资范围: summarizeScopeSection,
    费率结构: summarizeFeeSection,
    风险揭示摘要: summarizeRiskSection,
    投向与重仓: summarizeHoldingsSection,
  };

  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const h3 = line.match(/^### (.+)$/);
    if (h3 && handlers[h3[1]!]) {
      const heading = h3[1]!;
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i]!;
        if (/^#{2,3} /.test(next)) break;
        if (next.trim() === "---") break;
        bodyLines.push(next);
        i++;
      }
      const body = bodyLines.join("\n").trim();
      const polished = handlers[heading]!(body);
      out.push(`### ${heading}`, "", polished);
      continue;
    }
    out.push(line);
    i++;
  }

  return out.join("\n");
}

function isProspectusDump(text: string): boolean {
  const t = text.trim();
  if (t.length < 280) return false;
  if (PROSPECTUS_MARKERS.test(t)) return true;
  const boldBlocks = t.match(/\*\*[^*]{20,}\*\*/g) ?? [];
  return boldBlocks.length >= 2;
}

function dedupeProspectusBlocks(text: string): string {
  const headerRe =
    /\*\*[^*]*(?:产品资料概要|基金基本概况|季度报告)[^*]*\*\*/g;
  const headers: Array<{ index: number; ts: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    const chunk = text.slice(m.index, m.index + 500);
    const dateMatch =
      chunk.match(/发布时间[：:]\s*(\d{4}-\d{2}-\d{2})/) ??
      chunk.match(/编制日期[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const ts = dateMatch
      ? String(dateMatch[1]).includes("-")
        ? Date.parse(String(dateMatch[1]))
        : Date.parse(
            `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`,
          )
      : 0;
    headers.push({ index: m.index!, ts });
  }

  if (headers.length <= 1) return text;

  headers.sort((a, b) => b.ts - a.ts);
  const keep = headers[0]!;
  const laterInDoc = headers
    .filter((h) => h.index > keep.index)
    .sort((a, b) => a.index - b.index);
  const sliceEnd = laterInDoc[0]?.index ?? text.length;
  return text.slice(keep.index, sliceEnd).trim();
}

function extractLabeledFields(
  text: string,
): { goal?: string; scope?: string; ratio?: string } {
  const findLabel = (
    markers: string[],
  ): { idx: number; len: number } | null => {
    for (const marker of markers) {
      const idx = text.indexOf(marker);
      if (idx >= 0) return { idx, len: marker.length };
    }
    return null;
  };

  const goalL = findLabel(["投资目标"]);
  const scopeL = findLabel(["投资范围"]);
  const ratioL = findLabel(["基金的投资组合比例为", "投资组合比例"]);

  const out: { goal?: string; scope?: string; ratio?: string } = {};
  if (goalL) {
    const start = goalL.idx + goalL.len;
    const end = scopeL?.idx ?? ratioL?.idx ?? text.length;
    const value = normalizeSentence(text.slice(start, end));
    if (value) out.goal = value;
  }
  if (scopeL) {
    const start = scopeL.idx + scopeL.len;
    const end = ratioL?.idx ?? text.length;
    const value = normalizeSentence(text.slice(start, end));
    if (value) out.scope = value;
  }
  if (ratioL) {
    const start = ratioL.idx + ratioL.len;
    const value = normalizeSentence(text.slice(start));
    if (value) out.ratio = value;
  }
  return out;
}

function normalizeSentence(text: string): string {
  let s = truncateAtPortalJunk(text)
    .replace(/\[\^\d+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/(\d)%(\d)/g, "$1%–$2")
    .trim();
  s = s.replace(/[。；;，,\s]+$/g, "");
  if (s && !/[。！？!?]$/.test(s)) s += "。";
  return s;
}

function isScopeFieldUsable(text: string | undefined): boolean {
  const t = text?.trim() ?? "";
  if (!t || t.length < 8) return false;
  if (isWebPortalJunk(t)) return false;
  if (t.length > 220) return false;
  return true;
}

/** 后处理 scope 文本：去日期头、去重复、截断到 300 字 */
function cleanScopeText(text: string): string {
  let s = text;
  // 去掉日期头（发布时间、编制日期）
  s = s.replace(/[\(（]?发布时间[：:]\s*\d{4}-\d{2}-\d{2}[^\)）]*[\)）]?/g, "");
  s = s.replace(/编制日期[：:]\s*\d{4}年?\d{1,2}月?\d{1,2}日?/g, "");
  // 去掉重复的基金全名（如 "鹏华消费优选混合型证券投资基金基金产品资料概要"）
  s = s.replace(/[^\s]{4,30}(?:基金产品资料概要|招募说明书|更新)[^\n]*/g, "");
  // 去掉多余空白
  s = s.replace(/\s+/g, " ").trim();
  // 截断到 300 字
  const MAX_LEN = 300;
  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN);
    // 在最后一个句号或分号处截断，避免截断句子
    const lastPeriod = Math.max(s.lastIndexOf("。"), s.lastIndexOf("；"), s.lastIndexOf("；"));
    if (lastPeriod > MAX_LEN * 0.6) {
      s = s.slice(0, lastPeriod + 1);
    } else {
      s += "……";
    }
  }
  return s;
}

/** @internal 供单测使用 */
export function summarizeScopeSectionForTest(body: string): string {
  return summarizeScopeSection(body);
}

/** @internal 供单测使用 */
export function normalizeScopeBulletLayoutForTest(text: string): string {
  return normalizeScopeBulletLayout(text);
}

/** 行内「 - 」伪列表（常见于 LLM 重写或 L3 摘要） */
function hasInlineScopeBullets(text: string): boolean {
  return /[：:]\s*-\s+\S/.test(text) || /\*\*投资限制[：:]\*\*\s*-\s+/.test(text);
}

/** 将投资范围行内 bullet 拆成标准 Markdown 列表（RPT-SCOPE-FMT-01） */
function normalizeScopeBulletLayout(text: string): string {
  let s = text.trim();
  if (!hasInlineScopeBullets(s)) return s;

  const restrictionSplit = s.split(/(\*\*投资限制[：:]\*\*)/);
  const parts: string[] = [];

  for (let i = 0; i < restrictionSplit.length; i++) {
    const chunk = restrictionSplit[i]!;
    if (/^\*\*投资限制[：:]\*\*$/.test(chunk)) {
      parts.push("", chunk, "");
      continue;
    }
    let segment = chunk.trim();
    if (/^-\s+/.test(segment)) {
      segment = segment.replace(/^\s*-\s+/, "- ");
    }
    const withIntroBullets = segment.replace(/([：:])\s*-\s+/g, "$1\n\n- ");
    const withMidBullets = withIntroBullets.replace(
      /(?<=[^\n])\s-\s+(?=[\u4e00-\u9fff*])/g,
      "\n- ",
    );
    parts.push(withMidBullets.trim());
  }

  return parts.filter((p) => p !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim()
    .replace(/\*\*投资限制[：:]\*\*\n- /g, "**投资限制：**\n\n- ")
    .replace(/\*\*投资限制[：:]\*\*\s*-\s+/g, "**投资限制：**\n\n- ");
}

/** 合并误写的 ## 投资范围 行到 ### 投资范围，并删除重复 H2（RPT-SCOPE-FMT-01） */
export function mergeDuplicateInvestmentScope(md: string): string {
  const lines = md.split("\n");
  const h3Indexes: number[] = [];
  const orphanH2: Array<{ index: number; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "### 投资范围") h3Indexes.push(i);
    const h2 = line.match(/^## 投资范围\s+(.+)$/);
    if (h2) orphanH2.push({ index: i, content: h2[1]!.trim() });
  }

  if (!orphanH2.length) return md;

  const out = [...lines];
  for (const orphan of orphanH2.reverse()) {
    out.splice(orphan.index, 1);
    const nearestH3 = h3Indexes.filter((idx) => idx < orphan.index).pop();
    if (nearestH3 == null) {
      out.splice(orphan.index, 0, "### 投资范围", "", normalizeScopeBulletLayout(orphan.content));
      continue;
    }

    let bodyEnd = out.length;
    for (let j = nearestH3 + 1; j < out.length; j++) {
      const next = out[j]!;
      if (/^#{2,3} /.test(next) || next.trim() === "---") {
        bodyEnd = j;
        break;
      }
    }

    const existing = out.slice(nearestH3 + 1, bodyEnd).join("\n").trim();
    const merged = mergeScopeBodies(existing, orphan.content);
    const replacement = ["", merged, ""];
    out.splice(nearestH3 + 1, bodyEnd - nearestH3 - 1, ...replacement);
  }

  return out.join("\n");
}

function mergeScopeBodies(existing: string, incoming: string): string {
  const normalizedIncoming = normalizeScopeBulletLayout(incoming);
  if (!existing) return normalizedIncoming;
  if (existing.includes(normalizedIncoming.slice(0, 40))) return existing;
  if (normalizedIncoming.includes(existing.slice(0, 40))) return normalizedIncoming;
  return `${existing}\n\n${normalizedIncoming}`.trim();
}

function formatStructuredScopeSection(body: string): string {
  const normalized = normalizeScopeBulletLayout(body);
  const quote = extractBlockquote(body);
  const prose = normalized.replace(/^>\s.*$/gm, "").trim();
  if (!prose) return body.trim();

  return [
    prose,
    "",
    quote ??
      "> 以上摘编自公开披露的产品资料概要，完整条款以基金公司最新法律文件为准。",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeScopeSection(body: string): string {
  const trimmed = body.trim();
  if (hasInlineScopeBullets(trimmed)) {
    return formatStructuredScopeSection(trimmed);
  }

  const lineBullets = (trimmed.match(/^-\s+/gm) ?? []).length;
  if (lineBullets >= 2 && /\*\*投资限制/.test(trimmed)) {
    return formatStructuredScopeSection(trimmed);
  }

  if (isWebPortalJunk(trimmed) || isProspectusDump(trimmed) || trimmed.length >= 200) {
    // fall through to structured bullets
  } else if (trimmed.length < 320) {
    return trimmed;
  }

  const text = dedupeProspectusBlocks(body);
  const { goal, scope, ratio } = extractLabeledFields(text);
  const cleanedScope = scope ? cleanScopeText(scope) : undefined;

  const bullets: string[] = [];
  if (isScopeFieldUsable(goal)) bullets.push(`- **投资目标：** ${goal}`);
  if (isScopeFieldUsable(cleanedScope)) bullets.push(`- **主要投向：** ${cleanedScope}`);
  if (isScopeFieldUsable(ratio)) bullets.push(`- **资产配置：** ${ratio}`);

  if (!bullets.length) {
    const m = text.match(/本基金[^。]{20,200}/);
    if (m?.[0]) bullets.push(`- ${normalizeSentence(m[0])}`);
  }

  if (!bullets.length) return trimLongPlainText(body);

  const quote = extractBlockquote(body);
  return [
    bullets.join("\n"),
    "",
    quote ??
      "> 以上摘编自公开披露的产品资料概要，完整条款以基金公司最新法律文件为准。",
  ]
    .filter(Boolean)
    .join("\n");
}

function isFeeSectionJunk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/每份累计[\d.]+元|详情\s|资产配置策略|投资目标|投资范围/.test(t)) return true;
  if (t.length > 200 && !/[\d.]+\s*%\s*\/\s*年|管理(?:费)[率]?[^。]{0,12}[\d.]+\s*%/.test(t)) {
    return true;
  }
  return false;
}

const FEE_SECTION_FOOTER =
  "> 费率以基金公司最新招募说明书/产品资料概要为准；不同销售渠道申购费可能不同。";

function stripFeeSectionFooter(text: string): string {
  return text
    .replace(/\n?> 费率以基金公司最新招募说明书[^\n]*/g, "")
    .trim();
}

function summarizeFeeSection(body: string): string {
  const rawQuote = extractBlockquote(body);
  const quote = rawQuote
    ? stripFeeSectionFooter(rawQuote) || null
    : null;
  const prose = stripFeeSectionFooter(body.replace(/^>\s.*$/gm, ""));

  const shouldSummarize =
    isProspectusDump(prose) ||
    isFeeSectionJunk(prose) ||
    prose.length >= 200 ||
    /管理费|托管费|申购费/.test(prose);

  if (!shouldSummarize) return body.trim();

  const text = dedupeProspectusBlocks(prose);
  const fees = sanitizeParsedFeeRates(parseFeeRatesFromText(text));
  const table = formatCustomerFeeTable(fees);

  const parts: string[] = [];
  if (quote) parts.push(quote, "");

  if (table) {
    parts.push(table);
  } else {
    parts.push(formatMissingFeeFallback());
  }

  parts.push("", FEE_SECTION_FOOTER);
  return parts.join("\n");
}

function summarizeRiskSection(body: string): string {
  if (!isProspectusDump(body)) return trimLongPlainText(body, 600);

  const text = dedupeProspectusBlocks(body);
  const risks: string[] = [];
  const riskPatterns = [
    /市场风险[^。]{0,80}。/,
    /流动性风险[^。]{0,80}。/,
    /信用风险[^。]{0,80}。/,
    /管理风险[^。]{0,80}。/,
    /净值波动[^。]{0,80}。/,
    /投资有风险[^。]{0,80}。/,
  ];
  for (const re of riskPatterns) {
    const m = text.match(re);
    if (m?.[0]) risks.push(`- ${normalizeSentence(m[0])}`);
  }

  if (!risks.length) {
    const generic = text.match(/投资有风险[\s\S]{0,120}。/);
    if (generic?.[0]) risks.push(`- ${normalizeSentence(generic[0])}`);
  }

  if (!risks.length) return trimLongPlainText(body, 600);
  return [
    risks.slice(0, 5).join("\n"),
    "",
    "> 完整风险揭示请查阅基金招募说明书；请结合自身风险承受能力决策。",
  ].join("\n");
}

function containsMarkdownTable(text: string): boolean {
  return /^\|.+\|\s*$/m.test(text) && /^\|[-: |]+\|\s*$/m.test(text);
}

function summarizeHoldingsSection(body: string): string {
  if (containsMarkdownTable(body)) return body.trim();
  if (!isProspectusDump(body)) return body.trim();
  const quote = extractBlockquote(body);
  const text = dedupeProspectusBlocks(body.replace(/^>\s.*$/gm, "").trim());
  const summary = trimLongPlainText(text, 360);
  if (quote) return `${summary}\n\n${quote}`;
  return `${summary}\n\n> **暂无结构化前十大重仓数据**；完整持仓以基金公司最新季报为准。`;
}

function extractBlockquote(body: string): string | null {
  const lines = body.split("\n");
  const block: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    if (line.startsWith(">")) {
      inQuote = true;
      block.push(line);
      continue;
    }
    if (inQuote && line.trim() === "") continue;
    if (inQuote) break;
  }
  return block.length ? block.join("\n") : null;
}

function trimLongPlainText(text: string, max = 420): string {
  const cleaned = text
    .replace(/\[\^\d+\]/g, "")
    .replace(/\*\*[^*]{10,}\*\*[：:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastPeriod = cut.lastIndexOf("。");
  return (lastPeriod > max * 0.5 ? cut.slice(0, lastPeriod + 1) : `${cut}…`).trim();
}

function paragraphKey(text: string): string {
  return text
    .replace(/\[\^\d+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, "")
    .slice(0, 160);
}

function isSubstantialDuplicate(a: string, b: string): boolean {
  const ka = paragraphKey(a);
  const kb = paragraphKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length > 80 && kb.length > 80) {
    if (ka.includes(kb) || kb.includes(ka)) return true;
  }
  return false;
}

/** 跨段落去重，保留首次出现 */
export function dedupeParagraphs(md: string): string {
  const blocks = md.split(/\n{2,}/);
  const seen: string[] = [];
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    if (/^```/.test(trimmed) || trimmed.startsWith("__RPT_CODE_FENCE_")) {
      out.push(trimmed);
      continue;
    }
    if (/^\|/.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    if (trimmed.startsWith(">")) {
      out.push(trimmed);
      continue;
    }

    const dup = seen.some((prev) => isSubstantialDuplicate(prev, trimmed));
    if (dup) continue;
    seen.push(trimmed);
    out.push(trimmed);
  }

  return out.join("\n\n");
}

function sanitizePlainText(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (/^#{1,6}\s/.test(line)) return line;
      if (/^\s*\|/.test(line)) return line;
      if (/^```/.test(line)) return line;
      if (line.startsWith("__RPT_CODE_FENCE_")) return line;
      if (line.trim() === "---") return line;
      if (/^>\s/.test(line)) return `> ${sanitizeCustomerFacingText(line.slice(2))}`;
      if (line.trim() === "") return line;
      return sanitizeCustomerFacingText(line);
    })
    .join("\n");
}

function ensureSystemDisclaimer(md: string): string {
  if (
    md.includes(SYSTEM_DISCLAIMER) ||
    /不构成投资建议/.test(md)
  ) {
    return md;
  }
  return `${md.trim()}\n\n---\n\n${SYSTEM_DISCLAIMER}\n`;
}

function collapseWhitespace(md: string): string {
  return md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** 供 Verify 使用：正文 ## 是否缺「本章回答：」 */
export function listChaptersMissingAnswer(md: string): string[] {
  // 本章回答已废弃，始终返回空数组
  return [];
}
