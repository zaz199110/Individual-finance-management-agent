/** 投资需求报告 · LLM 参与块对客质检（§6 · PROFILE-LLM-QA-01）
 *
 * 与基金 `reviewAndRefineFundDraft` 审视 L1 披露小节同理，仅校验 **LLM 参与** 的两块：
 * - 格式清晰（结构、编号、blockquote）
 * - C 端友好（无内部词、无顾问腔、无 Tab/荐基）
 * - 语言简洁（单条长度、少数字堆砌）
 */

const INTERNAL_TERMS =
  /\b(L0|L1|L2|L3|goal_detail|investment_constraints|chunk_id|profile_version|goal_constraint_id)\b/i;

const FORBIDDEN_ADVICE =
  /建议买入|建议卖出|强烈推荐|资产配置\s*Tab|下一步去|去上方|fund_code/i;

const ALLOCATION_HINT =
  /(?:股票|债券|货币|权益)\s*[占配].*?\d+\s*%|大类.{0,6}\d+\s*%|配置比例/i;

const FUND_CODE = /\b\d{6}\b/;

const TAB_FLOW = /Tab|流程指引|点击.*Tab/i;

/** snake_case / 枚举键名泄漏 */
const JSON_KEY_LEAK = /\b[a-z]+_[a-z_]+\b/;

const ADVISOR_CLICHES =
  /综上所述|基于以上分析|毋庸置疑|不难看出|众所周知|从专业角度|作为顾问/i;

const MARKET_OPINION =
  /宏观形势|市场走势|牛市|熊市|当前市场|大盘|加息周期|经济下行/i;

export interface LlmSectionQualityResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function extractUnderstandingBlock(md: string): string | null {
  const m = md.match(
    /^## 对您需求的理解\s*\n([\s\S]*?)^---\s*\n\s*## 合规与说明/m,
  );
  if (!m) return null;
  const body = m[1] ?? "";
  const withoutIntro = body.replace(/^[\s\S]*?>\s*以下基于上文[\s\S]*?\n\n/m, "");
  return withoutIntro.trim() || body.trim();
}

function sharedForbiddenChecks(text: string, label: string): string[] {
  const errors: string[] = [];
  if (INTERNAL_TERMS.test(text)) {
    errors.push(`「${label}」含内部术语，须改为对客表述。`);
  }
  if (/AI 分析/.test(text)) {
    errors.push(`「${label}」禁止出现「AI 分析」。`);
  }
  if (FORBIDDEN_ADVICE.test(text)) {
    errors.push(`「${label}」含买卖建议或 Tab/流程指引。`);
  }
  if (ALLOCATION_HINT.test(text)) {
    errors.push(`「${label}」含大类配置比例，须删除。`);
  }
  if (FUND_CODE.test(text)) {
    errors.push(`「${label}」含疑似基金代码。`);
  }
  if (TAB_FLOW.test(text)) {
    errors.push(`「${label}」含 Tab/流程指引。`);
  }
  if (JSON_KEY_LEAK.test(text)) {
    errors.push(`「${label}」含疑似内部字段名（须改为中文标签）。`);
  }
  if (MARKET_OPINION.test(text)) {
    errors.push(`「${label}」含市场观点，投资需求报告禁止。`);
  }
  return errors;
}

function sharedAdvisorWarnings(text: string, label: string): string[] {
  const warnings: string[] = [];
  if (ADVISOR_CLICHES.test(text)) {
    warnings.push(`「${label}」顾问腔偏重，建议改为更口语的对客表述。`);
  }
  return warnings;
}

function sharedFriendlyWarnings(text: string, label: string): string[] {
  const warnings: string[] = [];
  const longSentence = text
    .split(/[。！？\n]/)
    .some((s) => s.replace(/\*\*/g, "").trim().length > 100);
  if (longSentence) {
    warnings.push(`「${label}」存在过长单句，建议拆短。`);
  }
  return warnings;
}

/** §6 对您需求的理解：编号 + 非复读表 + 简洁 */
export function validateUnderstandingQuality(body: string): LlmSectionQualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!body.trim()) {
    return { ok: false, errors: ["「对您需求的理解」为空。"], warnings };
  }

  errors.push(...sharedForbiddenChecks(body, "对您需求的理解"));
  warnings.push(...sharedAdvisorWarnings(body, "对您需求的理解"));
  warnings.push(...sharedFriendlyWarnings(body, "对您需求的理解"));

  const numbered = body.match(/\*\*[1-4]\./g) ?? [];
  if (numbered.length < 3) {
    errors.push("「对您需求的理解」须至少 3 条编号要点（**1. ** **2. ** …）。");
  }

  if (/^\|/m.test(body)) {
    errors.push("「对您需求的理解」禁止 Markdown 表格（勿复读 §3–§5 整表）。");
  }

  const yuanCount = (body.match(/元/g) ?? []).length;
  if (yuanCount > 8) {
    warnings.push("「对您需求的理解」数字堆砌偏多，建议改为交叉解读。");
  }

  for (const chunk of body.split(/\*\*[1-4]\./).slice(1)) {
    if (chunk.length > 520) {
      warnings.push("「对您需求的理解」单条偏长，建议精简。");
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateProfileLlmSections(md: string): LlmSectionQualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const understanding = extractUnderstandingBlock(md);
  if (understanding) {
    const r = validateUnderstandingQuality(understanding);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  // Note: the current report blueprint no longer emits a "对您需求的理解"
  // section; absence is expected and does not flag an error.

  return { ok: errors.length === 0, errors, warnings };
}

/** refine 落稿前：不合格则回退规则稿 */
export function pickAcceptedLlmSection(
  polished: string | null,
  fallback: string,
): string {
  if (!polished?.trim()) return fallback;
  const result = validateUnderstandingQuality(polished);
  return result.ok ? polished : fallback;
}
