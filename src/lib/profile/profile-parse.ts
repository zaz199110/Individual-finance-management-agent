import { validateBasicInfo } from "./basic-info";
import type { BasicInfo } from "./types";

export interface ProfileParseResult {
  ok: boolean;
  basic_info?: BasicInfo;
  error?: string;
  warnings?: string[];
}

function parseAmountYuan(
  text: string,
  patterns: RegExp[],
): number | undefined {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const raw = m[1].replace(/,/g, "");
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) continue;
      const isWan = /万/.test(m[0]);
      return isWan ? val * 10000 : val;
    }
  }
  return undefined;
}

const NON_NAME_WORDS = new Set([
  "单身",
  "已婚",
  "离异",
  "未婚",
  "一个",
  "两个",
  "三个",
  "一儿",
  "一女",
  "没有",
  "暂无",
  "不知道",
  "不太",
  "大概",
  "大约",
  "左右",
]);

function extractName(text: string): string | undefined {
  // 最可靠：显式「姓名」「我的名字」
  const explicit = text.match(
    /(?:姓名|我的名字|名字)[是为：:\s]+[:：]?\s*([\u4e00-\u9fa5]{2,4})/,
  );
  if (explicit) return explicit[1];

  // 「我叫 X」
  const jiao = text.match(/我叫\s*([\u4e00-\u9fa5]{2,4})/);
  if (jiao && !NON_NAME_WORDS.has(jiao[1])) return jiao[1];

  return undefined;
}

function extractMaritalStatus(text: string): string | undefined {
  const parts: string[] = [];
  if (/单身/.test(text)) parts.push("单身");
  else if (/已婚/.test(text)) parts.push("已婚");
  else if (/离异/.test(text)) parts.push("离异");
  else if (/未婚/.test(text)) parts.push("未婚");

  const childPattern =
    /(?:有|一个|两个|三个|一儿一女|儿女双全)([^，。；,.\s]*?孩子|[^，。；,.\s]*?子女|[^，。；,.\s]*?儿子|[^，。；,.\s]*?女儿)/;
  if (/没孩子|没有孩子|暂无子女|没有子女/.test(text)) {
    parts.push("没有孩子");
  } else {
    const childMatch = text.match(childPattern);
    if (childMatch) parts.push(childMatch[0]);
  }

  return parts.length > 0 ? parts.join("，") : undefined;
}

function extractOccupation(text: string): string | undefined {
  const explicit = text.match(
    /(?:职业|工作)[是为：:\s]+[:：]?\s*([\u4e00-\u9fa5]{2,20})/,
  );
  if (explicit) return explicit[1];

  const zuo = text.match(
    /做\s*([\u4e00-\u9fa5]{2,20})(?:工作|行业|职业)?/,
  );
  if (zuo) return zuo[1];

  const suffix = text.match(
    /([\u4e00-\u9fa5]{2,10})(?:上班|职员|员工|经理|总监|工程师|教师|医生|律师|公务员|自由职业|做生意)/,
  );
  if (suffix) return suffix[0];

  return undefined;
}

function extractAge(text: string): number | undefined {
  const m = text.match(/(\d{1,2})\s*岁/);
  if (m) {
    const age = parseInt(m[1], 10);
    if (age >= 18 && age <= 100) return age;
  }
  return undefined;
}

interface ExtractedBasicInfo {
  name?: string;
  age?: number;
  gender?: string;
  marital_status?: string;
  has_children?: string;
  occupation?: string;
  investment_experience?: string;
  annual_income_after_tax?: number;
  monthly_income_after_tax?: number;
  financial_assets?: number;
  loan_balance_total?: number;
  monthly_loan_payment?: number;
  monthly_fixed_expense?: number;
  monthly_investable?: number;
}

function profileParseByRules(text: string): {
  ok: boolean;
  extracted?: ExtractedBasicInfo;
  error?: string;
} {
  const extracted: ExtractedBasicInfo = {};

  const name = extractName(text);
  if (name) extracted.name = name;

  const maritalStatus = extractMaritalStatus(text);
  if (maritalStatus) extracted.marital_status = maritalStatus;

  const occupation = extractOccupation(text);
  if (occupation) extracted.occupation = occupation;

  const age = extractAge(text);
  if (age !== undefined) extracted.age = age;

  const annualIncome = parseAmountYuan(text, [
    /税后?年收入\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /年薪\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (annualIncome !== undefined) extracted.annual_income_after_tax = annualIncome;

  const monthlyIncome = parseAmountYuan(text, [
    /月\s*收入\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月税后?收入\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /税后?月薪\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /每月税后?到手\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月薪\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (monthlyIncome !== undefined) extracted.monthly_income_after_tax = monthlyIncome;

  const financialAssets = parseAmountYuan(text, [
    /可投资金融资产\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /可投资资产\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /可用于投资\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (financialAssets !== undefined) extracted.financial_assets = financialAssets;

  const loanBalance = parseAmountYuan(text, [
    /贷款[总额余额待还]\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /总还贷\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /贷款还剩\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /贷款余额\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (loanBalance !== undefined) extracted.loan_balance_total = loanBalance;

  const monthlyLoanPayment = parseAmountYuan(text, [
    /每个月还贷\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /每月还贷\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月还贷\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月供\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (monthlyLoanPayment !== undefined) extracted.monthly_loan_payment = monthlyLoanPayment;

  const monthlyExpense = parseAmountYuan(text, [
    /月固定?生?活?支[出开]\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /每月支[出开]\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月生活费\D*(\d[\d,.]*)\s*(?:元|万)?/,
    /月支[出开]\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (monthlyExpense !== undefined) extracted.monthly_fixed_expense = monthlyExpense;

  const monthlyInvestable = parseAmountYuan(text, [
    /每?月可投资\D*(\d[\d,.]*)\s*(?:元|万)?/,
  ]);
  if (monthlyInvestable !== undefined) extracted.monthly_investable = monthlyInvestable;

  // Extract gender
  const genderMatch = text.match(/性别[：:]\s*([男女])/);
  if (genderMatch) extracted.gender = genderMatch[1];

  // Extract has_children
  const childrenMatch = text.match(/子女[情况]?[：:]\s*(.+)/);
  if (childrenMatch) {
    extracted.has_children = childrenMatch[1].trim();
  } else if (/有子女|有孩子/.test(text)) {
    extracted.has_children = "有子女";
  } else if (/无子女|没有子女|没孩子|没有孩子|暂无子女/.test(text)) {
    extracted.has_children = "无子女";
  }

  // Extract investment_experience
  const investMatch = text.match(/投资经验[：:]\s*(.+)/);
  if (investMatch) extracted.investment_experience = investMatch[1].trim();

  if (Object.keys(extracted).length === 0) {
    return { ok: false, error: "规则引擎未匹配到任何字段。" };
  }

  return { ok: true, extracted };
}

function fillDefaults(extracted: ExtractedBasicInfo): BasicInfo {
  const monthlyIncome = extracted.monthly_income_after_tax ?? 0;
  const monthlyExpense = extracted.monthly_fixed_expense ?? 0;
  const monthlyLoan = extracted.monthly_loan_payment ?? 0;
  const annualIncome =
    extracted.annual_income_after_tax ??
    (monthlyIncome > 0 ? monthlyIncome * 12 : 0);

  return {
    name: extracted.name ?? "未提供",
    age: extracted.age ?? 30,
    gender: extracted.gender ?? "",
    marital_status: extracted.marital_status ?? "未提供",
    has_children: extracted.has_children ?? "",
    occupation: extracted.occupation ?? "未提供",
    investment_experience: extracted.investment_experience ?? "",
    annual_income_after_tax: annualIncome,
    monthly_income_after_tax: monthlyIncome,
    financial_assets: extracted.financial_assets ?? 0,
    loan_balance_total: extracted.loan_balance_total ?? 0,
    monthly_loan_payment: monthlyLoan,
    monthly_fixed_expense: monthlyExpense,
    monthly_investable:
      extracted.monthly_investable ?? Math.max(0, monthlyIncome - monthlyExpense - monthlyLoan),
  };
}

function mergeWithPrevious(
  extracted: ExtractedBasicInfo,
  previous: BasicInfo,
): BasicInfo {
  const merged: BasicInfo = { ...previous };

  for (const key of Object.keys(extracted) as (keyof ExtractedBasicInfo)[]) {
    const val = extracted[key];
    if (val !== undefined && val !== null) {
      (merged as unknown as Record<string, unknown>)[key] = val;
    }
  }

  // 若月收变更而年收入未被显式变更，按 PRD 口径联动（税后年收入 = 月税后到手 × 12）
  if (
    extracted.monthly_income_after_tax !== undefined &&
    extracted.annual_income_after_tax === undefined
  ) {
    merged.annual_income_after_tax = merged.monthly_income_after_tax * 12;
  }

  // 若影响月可投资公式但未显式给月可投资，自动重算
  if (
    (extracted.monthly_income_after_tax !== undefined ||
      extracted.monthly_fixed_expense !== undefined ||
      extracted.monthly_loan_payment !== undefined) &&
    extracted.monthly_investable === undefined
  ) {
    merged.monthly_investable = Math.max(
      0,
      merged.monthly_income_after_tax -
        merged.monthly_fixed_expense -
        merged.monthly_loan_payment,
    );
  }

  return merged;
}

// ── choice-format parsing (deterministic, rule-based) ──

export interface ChoiceFormatResult {
  ok: boolean;
  extracted?: ExtractedBasicInfo;
  error?: string;
  /** Fields that were NOT found in the input (will be filled by defaults or previous_basic_info) */
  missingFields?: string[];
}

const CATEGORICAL_MAP: Record<
  number,
  { field: keyof ExtractedBasicInfo; choices: Record<string, string> }
> = {
  3: {
    field: "marital_status",
    choices: {
      A: "单身，无子女",
      B: "已婚，无子女",
      C: "已婚，有1个孩子",
      D: "已婚，有2个孩子",
      E: "离异",
    },
  },
  4: {
    field: "occupation",
    choices: {
      A: "企业员工",
      B: "自由职业",
      C: "公务员/事业单位",
      D: "企业主",
      E: "退休",
    },
  },
};

const NUMERIC_FIELDS: Record<number, keyof ExtractedBasicInfo> = {
  2: "age",
  5: "annual_income_after_tax",
  6: "monthly_income_after_tax",
  7: "financial_assets",
  8: "loan_balance_total",
  9: "monthly_loan_payment",
  10: "monthly_fixed_expense",
  11: "monthly_investable",
};

const TEXT_FIELDS: Record<number, keyof ExtractedBasicInfo> = {
  1: "name",
  12: "gender",
  13: "has_children",
  14: "investment_experience",
};

const ALL_CHOICE_FIELDS: (keyof ExtractedBasicInfo)[] = [
  "name",
  "age",
  "gender",
  "marital_status",
  "has_children",
  "occupation",
  "investment_experience",
  "annual_income_after_tax",
  "monthly_income_after_tax",
  "financial_assets",
  "loan_balance_total",
  "monthly_loan_payment",
  "monthly_fixed_expense",
  "monthly_investable",
];

export function parseChoiceFormat(input: string): ChoiceFormatResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "输入为空。" };
  }

  // Step 1: Find all per-question segments via matchAll.
  //        Pattern: (\d+)[：:\s]+(.*?)(?=\s+\d+[：:\s]|$)
  //        Captures: group 1 = question number, group 2 = answer text.
  const segmentRegex = /(\d+)[：:\s]+(.*?)(?=\s+\d+[：:\s]|$)/g;
  const matches = trimmed.matchAll(segmentRegex);

  // Step 2-4: Process each segment.
  const extracted: ExtractedBasicInfo = {};

  for (const match of matches) {
    const q = parseInt(match[1], 10);
    const rawAnswer = match[2].trim();
    if (!rawAnswer) continue;

    // Categorical fields (Q3, Q4)
    if (q in CATEGORICAL_MAP) {
      const map = CATEGORICAL_MAP[q];
      const letter = rawAnswer.toUpperCase();
      if (letter in map.choices) {
        (extracted as unknown as Record<string, unknown>)[map.field] =
          map.choices[letter];
      } else {
        // Free-text answer for categorical field — use as-is
        (extracted as unknown as Record<string, unknown>)[map.field] =
          rawAnswer;
      }
      continue;
    }

    // Numeric fields (Q2, Q5-Q11)
    if (q in NUMERIC_FIELDS) {
      const field = NUMERIC_FIELDS[q];
      const cleaned = rawAnswer.replace(/,/g, "");
      const hasWan = /万/.test(cleaned);
      const numStr = cleaned.replace(/万/g, "");
      const val = parseFloat(numStr);
      if (!Number.isFinite(val)) {
        return {
          ok: false,
          error: `第${q}项「${rawAnswer}」无法解析为数字。`,
        };
      }
      (extracted as unknown as Record<string, unknown>)[field] = hasWan
        ? val * 10000
        : val;
      continue;
    }

    // Text fields (Q1)
    if (q in TEXT_FIELDS) {
      (extracted as unknown as Record<string, unknown>)[TEXT_FIELDS[q]] =
        rawAnswer.trim();
      continue;
    }

    // Unknown question number: ignore silently (tolerance)
  }

  const missingFields = ALL_CHOICE_FIELDS.filter((f) => !(f in extracted));

  // No recognisable segments at all → not choice-format input
  if (Object.keys(extracted).length === 0) {
    return { ok: false, error: "未能识别到多选格式的字段。" };
  }

  return { ok: true, extracted, missingFields };
}

/**
 * §6.9 profile_parse：解析客户基本信息。
 * 优先尝试 多选格式 → JSON 解析；若失败且有 LLM 可用，调用 LLM 提取结构化数据。
 */
export async function profileParseBasicInfo(input: {
  text?: string;
  basic_info?: unknown;
  previous_basic_info?: BasicInfo;
}): Promise<ProfileParseResult> {
  if (input.basic_info) {
    const v = validateBasicInfo(input.basic_info);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }
    return { ok: true, basic_info: v.data, warnings: v.warnings };
  }

  const text = (input.text ?? "").trim();
  if (!text) {
    return { ok: false, error: "缺少待解析文本或 basic_info。" };
  }

  // 首选：确定性多选格式解析（Q-BASE / Q-BASE-DELTA 响应）
  const choiceResult = parseChoiceFormat(text);
  if (choiceResult.ok && choiceResult.extracted && Object.keys(choiceResult.extracted).length > 0) {
    const extracted = choiceResult.extracted;
    const merged = input.previous_basic_info
      ? mergeWithPrevious(extracted, input.previous_basic_info)
      : fillDefaults(extracted);

    const v = validateBasicInfo(merged);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }

    const fieldCount = Object.keys(extracted).length;
    const warnings: string[] = [];
    if (fieldCount < 14) {
      warnings.push(
        `已识别 ${fieldCount}/14 项（多选格式），${input.previous_basic_info ? "其余字段保持上一版" : "其余字段已填默认值"}。`,
      );
    }
    if (v.warnings.length > 0) warnings.push(...v.warnings);

    return { ok: true, basic_info: v.data, warnings };
  }
  // 若多选格式解析失败或无字段，回退到 JSON → 规则引擎 → LLM

  // 尝试 JSON 解析
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fence ? fence[1].trim() : text;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const info = parsed.basic_info ?? parsed;
    const previous = input.previous_basic_info;
    const merged = previous
      ? mergeWithPrevious(info as unknown as ExtractedBasicInfo, previous)
      : (info as unknown as BasicInfo);
    const v = validateBasicInfo(merged);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }
    return { ok: true, basic_info: v.data, warnings: v.warnings };
  } catch {
    // JSON 解析失败，尝试 key-value 格式 → 规则引擎 → LLM
  }

  // key-value 格式解析（复制粘贴场景：每行 "key：value"）
  const kvResult = parseKeyValueFormat(text);
  const kvExtracted = kvResult.extracted;
  const kvFieldCount = Object.keys(kvExtracted).length;
  if (kvFieldCount >= 5) {
    const merged = input.previous_basic_info
      ? mergeWithPrevious(kvExtracted, input.previous_basic_info)
      : fillDefaults(kvExtracted);

    const v = validateBasicInfo(merged);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }

    const warnings: string[] = [];
    if (kvFieldCount < 14) {
      warnings.push(
        `已提取 ${kvFieldCount}/14 项（key-value 格式），${input.previous_basic_info ? "其余字段保持上一版" : "其余字段已填默认值"}，可后续补充。`,
      );
    }
    if (v.warnings.length > 0) warnings.push(...v.warnings);

    return { ok: true, basic_info: v.data, warnings };
  }

  // 规则引擎兜底
  const ruleResult = profileParseByRules(text);
  if (ruleResult.ok && ruleResult.extracted) {
    const extracted = ruleResult.extracted;
    const merged = input.previous_basic_info
      ? mergeWithPrevious(extracted, input.previous_basic_info)
      : fillDefaults(extracted);

    const v = validateBasicInfo(merged);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }

    const extractedCount = Object.keys(extracted).length;
    const warnings: string[] = [];
    if (extractedCount > 0) {
      warnings.push(
        `已提取 ${extractedCount} 项信息，${input.previous_basic_info ? "其余字段保持上一版" : "其余字段已填默认值"}，可后续补充。`,
      );
    }
    if (v.warnings.length > 0) {
      warnings.push(...v.warnings);
    }

    return { ok: true, basic_info: v.data, warnings };
  }

  // LLM 提取路径
  try {
    const { resolveModelSlot } = await import("@/lib/supabase/server");
    const reasoning = await resolveModelSlot("reasoning");
    if (!reasoning?.api_base_url || !reasoning.api_key_encrypted) {
      return {
        ok: false,
        error: "未能从文本解析；LLM 凭证未配置。请粘贴 questionnaire 回复或 ```json basic_info``` 块。",
      };
    }

    const cfg = {
      api_base_url: reasoning.api_base_url,
      api_key: reasoning.api_key_encrypted,
      model_name: reasoning.model_name ?? "mimo-v2.5",
      provider: "mimo" as const,
    };

    const previousHint = input.previous_basic_info
      ? `用户此前已保存的基本情况为：${JSON.stringify(input.previous_basic_info)}。本次只提取变更项，未提及的字段请保持上一版值。`
      : "";

    const systemPrompt = `你是客户信息提取助手。从用户文本中提取投资需求相关的基本信息。
${previousHint}
输出一个 JSON 对象，字段如下（识别不到的字段设为 null；若用户只提供部分字段，其余字段保持已有值或 null）：
- name: 姓名
- age: 年龄（数字）
- gender: 性别（如「男」「女」）
- marital_status: 家庭现状（如「单身，没有孩子」「已婚，一个8岁的儿子」）
- has_children: 子女情况（如「有1个孩子」「无子女」）
- occupation: 职业
- investment_experience: 投资经验（如「没有经验」「有1-3年基金投资经验」）
- annual_income_after_tax: 税后年收入（数字，元）
- monthly_income_after_tax: 月税后到手（数字，元）
- financial_assets: 可投资金融资产（数字，元，不含自住房、公积金）
- loan_balance_total: 贷款待还总额（数字，元）
- monthly_loan_payment: 每月还贷现金（数字，元）
- monthly_fixed_expense: 每月固定生活开支（数字，元）
- monthly_investable: 每月可投资（数字，元）

仅输出 JSON，不要 markdown 代码围栏，不要解释。`;

    const protocol = /\/anthropic(\/|$)/i.test(cfg.api_base_url) ? "anthropic" : "openai";
    const url = protocol === "anthropic"
      ? `${cfg.api_base_url.replace(/\/$/, "")}/v1/messages`
      : `${cfg.api_base_url.replace(/\/$/, "")}/chat/completions`;

    const headers: Record<string, string> = protocol === "anthropic"
      ? { "Content-Type": "application/json", "x-api-key": cfg.api_key, "anthropic-version": "2023-06-01" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` };

    const body = protocol === "anthropic"
      ? { model: cfg.model_name, max_tokens: 1000, system: systemPrompt, messages: [{ role: "user", content: text }] }
      : { model: cfg.model_name, max_tokens: 1000, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }] };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      return { ok: false, error: `LLM 解析请求失败（${res.status}）。` };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const llmText = data.choices?.[0]?.message?.content?.trim();
    if (!llmText) {
      return { ok: false, error: "LLM 返回为空。" };
    }

    const llmFence = llmText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const llmJson = llmFence ? llmFence[1].trim() : llmText;
    const parsed = JSON.parse(llmJson) as Record<string, unknown>;

    const previous = input.previous_basic_info;
    const merged = previous
      ? mergeWithPrevious(parsed as unknown as ExtractedBasicInfo, previous)
      : (parsed as unknown as BasicInfo);
    const v = validateBasicInfo(merged);
    if (!v.ok || !v.data) {
      return { ok: false, error: v.errors.join(" "), warnings: v.warnings };
    }
    return { ok: true, basic_info: v.data, warnings: v.warnings };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `LLM 解析失败：${msg}。请粘贴 questionnaire 回复或 \`\`\`json basic_info\`\`\` 块。`,
    };
  }
}

/**
 * Parse conversational "key: value" format into ExtractedBasicInfo.
 * Each line should be in the form "key: value" (either : or ： as separator).
 * Known Chinese keys are mapped to ExtractedBasicInfo fields; unknown keys
 * are collected separately.
 *
 * Number fields support "万" suffix (multiplied by 10000) and comma separators.
 */
export function parseKeyValueFormat(input: string): {
  extracted: ExtractedBasicInfo;
  raw: Record<string, string>;
  unknown: string[];
} {
  const extracted: ExtractedBasicInfo = {};
  const raw: Record<string, string> = {};
  const unknown: string[] = [];

  const keyMapping: Record<string, { field: keyof ExtractedBasicInfo; isNumeric?: boolean }> = {
    "姓名": { field: "name" },
    "年龄": { field: "age", isNumeric: true },
    "性别": { field: "gender" },
    "婚姻状况": { field: "marital_status" },
    "婚姻": { field: "marital_status" },
    "家庭现状": { field: "marital_status" },
    "子女情况": { field: "has_children" },
    "子女": { field: "has_children" },
    "是否有子女": { field: "has_children" },
    "职业": { field: "occupation" },
    "工作": { field: "occupation" },
    "投资经验": { field: "investment_experience" },
    "税后年收入": { field: "annual_income_after_tax", isNumeric: true },
    "年收入": { field: "annual_income_after_tax", isNumeric: true },
    "每月税后到手": { field: "monthly_income_after_tax", isNumeric: true },
    "月收入": { field: "monthly_income_after_tax", isNumeric: true },
    "可投资金融资产": { field: "financial_assets", isNumeric: true },
    "金融资产": { field: "financial_assets", isNumeric: true },
    "贷款待还总额": { field: "loan_balance_total", isNumeric: true },
    "贷款": { field: "loan_balance_total", isNumeric: true },
    "每月还贷": { field: "monthly_loan_payment", isNumeric: true },
    "月还贷": { field: "monthly_loan_payment", isNumeric: true },
    "每月固定生活开支": { field: "monthly_fixed_expense", isNumeric: true },
    "生活开支": { field: "monthly_fixed_expense", isNumeric: true },
    "每月可投资": { field: "monthly_investable", isNumeric: true },
    "月可投资": { field: "monthly_investable", isNumeric: true },
  };

  function parseNumericValue(val: string): number {
    const cleaned = val.trim().replace(/,/g, "");
    const isWan = /万/.test(cleaned);
    const numStr = cleaned.replace(/万/g, "");
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) return 0;
    return isWan ? num * 10000 : num;
  }

  const lines = input.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.search(/[：:]/);
    if (colonIdx === -1) {
      unknown.push(trimmed);
      continue;
    }

    const key = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim();

    raw[key] = value;

    const mapping = keyMapping[key];
    if (mapping) {
      if (mapping.isNumeric) {
        (extracted as Record<string, unknown>)[mapping.field] = parseNumericValue(value);
      } else {
        (extracted as Record<string, unknown>)[mapping.field] = value;
      }
    } else {
      unknown.push(key);
    }
  }

  return { extracted, raw, unknown };
}
