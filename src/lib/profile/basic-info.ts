import type { BasicInfo } from "./types";

export interface BasicInfoValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data?: BasicInfo;
}

const REQUIRED_KEYS: (keyof BasicInfo)[] = [
  "name",
  "age",
  "marital_status",
  "occupation",
  "annual_income_after_tax",
  "monthly_income_after_tax",
  "financial_assets",
  "loan_balance_total",
  "monthly_loan_payment",
  "monthly_fixed_expense",
  "monthly_investable",
];

export function validateBasicInfo(raw: unknown): BasicInfoValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["basic_info 须为 JSON 对象。"], warnings: [] };
  }

  const o = raw as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    if (o[key] === undefined || o[key] === null || o[key] === "") {
      errors.push(`缺少必填字段：${key}`);
    }
  }

  const name = String(o.name ?? "").trim();
  if (name && (name.length < 1 || name.length > 20)) {
    errors.push("name 须 1–20 字。");
  }

  const age = Number(o.age);
  if (!Number.isInteger(age) || age < 18 || age > 100) {
    errors.push("age 须为 18–100 的整数。");
  }

  for (const key of [
    "annual_income_after_tax",
    "monthly_income_after_tax",
  ] as const) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n <= 0) {
      errors.push(`${key} 须大于 0。`);
    }
  }

  for (const key of [
    "financial_assets",
    "loan_balance_total",
    "monthly_loan_payment",
    "monthly_fixed_expense",
    "monthly_investable",
  ] as const) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n < 0) {
      errors.push(`${key} 不能为负数。`);
    }
  }

  const monthlyIncome = Number(o.monthly_income_after_tax);
  const monthlyExpense = Number(o.monthly_fixed_expense);
  const monthlyLoan = Number(o.monthly_loan_payment);
  const monthlyInvestable = Number(o.monthly_investable);
  if (
    Number.isFinite(monthlyIncome) &&
    Number.isFinite(monthlyExpense) &&
    Number.isFinite(monthlyLoan) &&
    Number.isFinite(monthlyInvestable)
  ) {
    const computed = monthlyIncome - monthlyExpense - monthlyLoan;
    if (Math.abs(computed - monthlyInvestable) > 1) {
      warnings.push(
        `月可投资核对：${monthlyIncome} − ${monthlyExpense} − ${monthlyLoan} = ${computed}，与填写的 ${monthlyInvestable} 不一致。`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      name,
      age,
      marital_status: String(o.marital_status).trim(),
      occupation: String(o.occupation).trim(),
      annual_income_after_tax: Number(o.annual_income_after_tax),
      monthly_income_after_tax: Number(o.monthly_income_after_tax),
      financial_assets: Number(o.financial_assets),
      loan_balance_total: Number(o.loan_balance_total),
      monthly_loan_payment: Number(o.monthly_loan_payment),
      monthly_fixed_expense: Number(o.monthly_fixed_expense),
      monthly_investable: Number(o.monthly_investable),
      gender: String(o.gender ?? "").trim(),
      has_children: String(o.has_children ?? "").trim(),
      investment_experience: String(o.investment_experience ?? "").trim(),
    },
  };
}

export function formatBasicInfoSummary(info: BasicInfo): string {
  return `${info.name}，${info.age} 岁 · 可投资 ${info.financial_assets.toLocaleString("zh-CN")} 元`;
}

export function formatBasicInfoCardBody(info: BasicInfo, formulaHint?: string): string {
  const lines = [
    `姓名：${info.name}`,
    `年龄：${info.age} 岁`,
    `性别：${info.gender || "未提供"}`,
    `家庭现状：${info.marital_status}`,
    `子女情况：${info.has_children || "未提供"}`,
    `职业：${info.occupation}`,
    `投资经验：${info.investment_experience || "未提供"}`,
    "",
    `税后年收入：${info.annual_income_after_tax.toLocaleString("zh-CN")} 元`,
    `每月税后到手：${info.monthly_income_after_tax.toLocaleString("zh-CN")} 元`,
    "",
    `可投资金融资产：${info.financial_assets.toLocaleString("zh-CN")} 元`,
    `贷款待还总额：${info.loan_balance_total.toLocaleString("zh-CN")} 元`,
    `每月还贷（自付现金）：${info.monthly_loan_payment.toLocaleString("zh-CN")} 元`,
    `每月固定生活开支：${info.monthly_fixed_expense.toLocaleString("zh-CN")} 元`,
    `每月可投资：${info.monthly_investable.toLocaleString("zh-CN")} 元`,
  ];
  if (formulaHint) {
    lines.push(`  （${formulaHint}）`);
  }
  return lines.join("\n");
}

/**
 * 格式化基本情况为可复制的示例格式，用于用户修改时参考
 * 格式：【基本情况】key：value
 */
export function formatBasicInfoAsCopyableExample(info: BasicInfo): string {
  const lines = [
    "【基本情况】",
    `姓名：${info.name}`,
    `年龄：${info.age}`,
    `性别：${info.gender || "未提供"}`,
    `家庭现状：${info.marital_status}`,
    `子女情况：${info.has_children || "未提供"}`,
    `职业：${info.occupation}`,
    `投资经验：${info.investment_experience || "未提供"}`,
    `税后年收入：${info.annual_income_after_tax}`,
    `每月税后到手：${info.monthly_income_after_tax}`,
    `可投资金融资产：${info.financial_assets}`,
    `贷款待还总额：${info.loan_balance_total}`,
    `每月还贷：${info.monthly_loan_payment}`,
    `每月固定开支：${info.monthly_fixed_expense}`,
    `每月可投资：${info.monthly_investable}`,
  ];
  return lines.join("\n");
}
