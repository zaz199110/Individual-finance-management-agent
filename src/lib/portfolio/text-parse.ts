import { completeText } from "@/lib/llm/invoke";
import { resolveProviderStack } from "@/lib/config/model-providers";
import type { HoldingsPosition } from "@/lib/portfolio/types";

export interface TextParseHoldingsResult {
  ok: boolean;
  source: "text";
  positions: HoldingsPosition[];
  missing_fields: string[];
  preview: string;
  error?: string;
}

function resolveReasoningConfig() {
  const stack = resolveProviderStack();
  return stack.reasoning;
}

/**
 * 解析管道符分隔的持仓表格格式。
 * 格式：基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额
 * 返回解析后的持仓数组，解析失败返回 null。
 */
/**
 * 清洗从网页/文档复制表格时常见的不可见和全角字符，避免解析失败。
 * - 全角管道符 → ASCII 管道符（核心：｜→|）
 * - 不可断空格 / 全角空格 → 普通空格
 * - 零宽字符 → 移除
 */
function normalizeSeparatedText(text: string): string {
  return text
    .replace(/\uFF5C/g, "|")   // 全角管道符 ｜ → ASCII |
    .replace(/\u00A0/g, " ")   // 不可断空格 → 普通空格
    .replace(/\u3000/g, " ")   // 全角空格 → 普通空格
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")  // 零宽字符移除
    .replace(/<br\s*\/?>/gi, "\n");   // HTML 换行标签 → 换行符
}

function parsePipeSeparatedHoldings(text: string): HoldingsPosition[] | null {
  text = normalizeSeparatedText(text);

  let lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // 单行回退：如果换行丢失，按 "空格+含6位基金代码的管道符段" 拆分
  if (lines.length < 2) {
    const singleLine = lines[0] ?? "";
    // 按 "空格+连续管道符段（含6位数字）" 拆分
    const recovered = singleLine
      .split(/\s+(?=\S+\s*\|\s*\d{6}\s*\|)/)
      .filter(Boolean);
    if (recovered.length >= 2) {
      lines = recovered;
    }
  }
  if (lines.length < 2) return null;

  // 检查第一行是否是表头
  const header = lines[0];
  if (!header.includes("基金名称") || !header.includes("基金代码")) {
    return null;
  }

  const positions: HoldingsPosition[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 跳过分隔行（如 |---|---|）
    if (/^[\s\-|]+$/.test(line)) continue;

    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 5) continue;

    const [name, code, date, amount, shares] = parts;

    // 验证基金代码
    if (!/^\d{6}$/.test(code)) continue;

    // 解析金额（去掉逗号和"元"）
    const paidAmount = Number(amount.replace(/[,，元]/g, ""));
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) continue;

    // 解析份额（去掉逗号和"份"）
    const sharesNum = Number(shares.replace(/[,，份]/g, ""));
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) continue;

    // 验证日期格式
    const dateStr = date.replace(/\//g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    positions.push({
      fund_code: code,
      fund_name: name || undefined,
      invested_at: dateStr,
      paid_amount: paidAmount,
      shares: sharesNum,
      source: "text",
      action: "add",
    });
  }

  return positions.length > 0 ? positions : null;
}

/**
 * 从自然语言描述中解析持仓记录。
 * 支持格式如：
 *   易方达蓝筹精选混合（005827），买入份额 2000 份，买入金额是 3700.00 元，买入日期 2026-03-01
 *   建信信息产业股票A (001070)，买入份额 3000 份，买入金额 12600 元，买入日期 2026-03-01
 */
function parseNaturalLanguageHoldings(text: string): HoldingsPosition[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 匹配一行中的基金代码（6 位数字，在括号内）
  const codeRegex = /[（(](\d{6})[）)]/;
  // 匹配份额
  const sharesRegex = /买入份额\s*([\d,，.]+)\s*份/;
  // 匹配金额
  const amountRegex = /买入金额[是]?\s*([\d,，.]+)\s*元?/;
  // 匹配日期
  const dateRegex = /买入日期\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/;

  const positions: HoldingsPosition[] = [];

  for (const line of lines) {
    const codeMatch = line.match(codeRegex);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const sharesMatch = line.match(sharesRegex);
    const amountMatch = line.match(amountRegex);
    const dateMatch = line.match(dateRegex);

    // 提取基金名称：括号之前的部分
    const nameMatch = line.match(/^(.+?)[（(]/);
    const name = nameMatch ? nameMatch[1].trim() : undefined;

    // 解析份额
    let shares = 0;
    if (sharesMatch) {
      shares = Number(sharesMatch[1].replace(/[,，]/g, ""));
    }

    // 解析金额
    let paidAmount = 0;
    if (amountMatch) {
      paidAmount = Number(amountMatch[1].replace(/[,，]/g, ""));
    }

    // 解析日期
    let investedAt = "1970-01-01";
    if (dateMatch) {
      investedAt = dateMatch[1].replace(/\//g, "-").replace(/年(\d{1,2})月(\d{1,2})/, "$1-$2").padStart(2, "0").replace(/-(\d)$/, "-0$1");
      // 确保日期格式 YYYY-MM-DD
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(investedAt)) {
        const parts = investedAt.split("-");
        investedAt = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
    }

    if (!Number.isFinite(paidAmount)) paidAmount = 0;
    if (!Number.isFinite(shares)) shares = 0;

    positions.push({
      fund_code: code,
      fund_name: name,
      invested_at: investedAt,
      paid_amount: paidAmount,
      shares: shares,
      source: "text",
      action: "add",
    });
  }

  return positions.length > 0 ? positions : null;
}

/**
 * 从用户文字描述中提取持仓记录（全量覆盖模式）。
 * 优先尝试管道符分隔格式解析 → 自然语言正则 → LLM 解析。
 */
export async function textParseHoldings(input: {
  user_text: string;
}): Promise<TextParseHoldingsResult> {
  // 优先尝试管道符分隔格式
  const pipeResult = parsePipeSeparatedHoldings(input.user_text);
  if (pipeResult) {
    return {
      ok: true,
      source: "text",
      positions: pipeResult,
      missing_fields: [],
      preview: `从表格解析到 ${pipeResult.length} 笔持仓。`,
    };
  }

  // 回退到自然语言正则解析
  const regexResult = parseNaturalLanguageHoldings(input.user_text);
  if (regexResult) {
    return {
      ok: true,
      source: "text",
      positions: regexResult,
      missing_fields: [],
      preview: `从文字解析到 ${regexResult.length} 笔持仓。`,
    };
  }

  // 最后回退到 LLM 解析
  const cfg = resolveReasoningConfig();
  if (!cfg) {
    return {
      ok: false,
      source: "text",
      positions: [],
      missing_fields: [],
      preview: "",
      error: "推理模型未配置，无法解析文字持仓。",
    };
  }

  const system =
    "你是中国公募基金持仓信息提取助手。请从用户的文字描述中提取基金持仓记录。\n" +
    "输出要求：\n" +
    "- 仅输出一个 JSON 数组，不要 markdown 代码围栏、不要解释\n" +
    "- 每项包含：fund_code（6 位基金代码）、fund_name（基金名称，识别不到则 null）、" +
    "invested_at（买入时间 YYYY-MM-DD，识别不到则 null）、paid_amount（买入金额，单位元，识别不到则 0）、shares（持有份额，识别不到则 0）\n" +
    "- 日期支持 2026-03-21、2026/03/21、2026年3月21日 等格式，统一输出 YYYY-MM-DD\n" +
    "- 金额支持 3000元、3千、3,000 等，统一输出数字\n" +
    "- 份额支持 3000份、3千份、3,000 份等，统一输出数字\n" +
    "- 如果用户提到「卖出」「赎回」「全部卖出」，仍然提取基金代码和名称，但 paid_amount 和 shares 设为 0\n" +
    "- 不要输出 action 等字段"

  try {
    const text = await completeText(cfg, {
      system,
      messages: [{ role: "user", content: input.user_text }],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return {
        ok: false,
        source: "text",
        positions: [],
        missing_fields: [],
        preview: "",
        error: "未能从文字解析出持仓数组。",
      };
    }

    const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    const parsed: HoldingsPosition[] = [];
    const missingFields: string[] = [];

    for (const row of raw) {
      const code = String(row.fund_code ?? "").padStart(6, "0").slice(-6);
      if (!/^\d{6}$/.test(code)) continue;

      const investedAt = row.invested_at ? String(row.invested_at) : null;
      const paid = Number(row.paid_amount ?? 0);
      const shares = Number(row.shares ?? 0);

      if (!investedAt) missingFields.push(`${code}:invested_at`);
      if (!paid || paid <= 0) missingFields.push(`${code}:paid_amount`);
      if (!shares || shares <= 0) missingFields.push(`${code}:shares`);

      parsed.push({
        fund_code: code,
        fund_name: row.fund_name ? String(row.fund_name) : undefined,
        invested_at: investedAt ?? "1970-01-01",
        paid_amount: paid,
        shares: shares,
        source: "text",
        action: "add",
      });
    }

    return {
      ok: parsed.length > 0,
      source: "text",
      positions: parsed,
      missing_fields: missingFields,
      preview:
        parsed.length > 0
          ? `从文字解析到 ${parsed.length} 笔持仓。` +
            (missingFields.length ? ` 待补全：${missingFields.join("、")}` : "")
          : "未能从文字解析出有效持仓。",
      error:
        parsed.length
          ? undefined
          : "未能从文字解析出有效持仓。请提供基金代码、买入时间、买入金额和持有份额。",
    };
  } catch (err) {
    return {
      ok: false,
      source: "text",
      positions: [],
      missing_fields: [],
      preview: "",
      error: err instanceof Error ? err.message : "文字持仓解析失败。",
    };
  }
}
