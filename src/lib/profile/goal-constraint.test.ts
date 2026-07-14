import { describe, expect, it } from "vitest";
import {
  loadSampleGoalPayload,
  parseGoalChoiceFormat,
  parseGoalKeyValueFormat,
  resolveGoalTypeFromMessage,
  validateGoalConstraint,
  type GoalType,
} from "./goal-constraint";

describe("validateGoalConstraint", () => {
  it("accepts sample retirement payload", () => {
    const sample = loadSampleGoalPayload();
    const r = validateGoalConstraint(sample);
    expect(r.ok).toBe(true);
  });

  it("rejects invalid goal_type", () => {
    const sample = { ...loadSampleGoalPayload(), goal_type: "invalid" };
    const r = validateGoalConstraint(sample);
    expect(r.ok).toBe(false);
  });
});

describe("parseGoalChoiceFormat", () => {
  // ── Perfect inputs ──
  // Shared Q1-5: risk_tolerance(B=稳健), max_drawdown(15), target_return(6),
  // principal_amount(500000), monthly_amount(5000)

  it("parses 5 shared questions correctly", () => {
    const input = "1 B 2 15 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(true);
    expect(result.investment_constraints).toEqual({
      risk_tolerance: "稳健",
      max_drawdown: 15,
      target_return: 6,
      principal_amount: 500000,
      monthly_amount: 5000,
    });
  });

  it("works with any goal_type (shared questions are goal-agnostic)", () => {
    const input = "1 B 2 15 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "retirement");
    expect(result.ok).toBe(true);
    expect(result.investment_constraints).toEqual({
      risk_tolerance: "稳健",
      max_drawdown: 15,
      target_return: 6,
      principal_amount: 500000,
      monthly_amount: 5000,
    });
  });

  // ── Edge cases ──

  it("returns error for empty input", () => {
    const result = parseGoalChoiceFormat("   ", "marriage_child");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("输入为空");
  });

  it("returns error for missing answers (too few)", () => {
    // Only 3 provided; needs 5
    const input = "1 B 2 15 3 6";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/不完整/);
  });

  it("returns error for invalid categorical letter", () => {
    const input = "1 Z 2 15 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/无效/);
  });

  it("handles case-insensitive letters (lowercase 'b')", () => {
    const input = "1 b 2 15 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(true);
    expect(result.investment_constraints?.risk_tolerance).toBe("稳健");
  });

  it("handles number with extra text prefix (约)", () => {
    const input = "1 B 2 约15 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(true);
    expect(result.investment_constraints?.max_drawdown).toBe(15);
  });

  it("returns error for unparseable number", () => {
    const input = "1 B 2 notanumber 3 6 4 500000 5 5000";
    const result = parseGoalChoiceFormat(input, "marriage_child");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/无法解析为数字/);
  });
});

describe("parseGoalKeyValueFormat", () => {
  // ── 5 scenarios: realistic inputs ──

  it("retirement: perfect key-value input", () => {
    const input = `【退休养老】
风险偏好：稳健型
一次性投入：100,000 元
每月投入：5,000 元
目标年化收益：6%
最大回撤承受：15%
定投期限：12个月
退休金领取日期：2055-01-01
每月退休生活支出：6,000 元`;
    const result = parseGoalKeyValueFormat(input, "retirement");
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data!;
    expect(data.goal_type).toBe("retirement");
    const constraints = data.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("稳健型");
    expect(constraints.max_drawdown).toBe("15%");
    expect(constraints.target_return).toBe(6);
    expect(constraints.principal_amount).toBe(100000);
    expect(constraints.monthly_amount).toBe(5000);
    expect(constraints.dca_completion_months).toBe("12个月");
    expect(constraints.goal_type).toBe("retirement");
    expect(constraints.money_needed_start_date).toBe("2055-01-01");
    expect(constraints.monthly_retirement_spending).toBe(6000);
  });

  it("marriage_child: perfect key-value input", () => {
    const input = `【结婚生育】
风险偏好：平衡型
一次性投入：200,000
每月投入：10,000
目标年化收益：8%
最大回撤承受：20%
定投期限：12个月
开始投资日期：2026-07-04
需要用款日期：2028-12-01
目标金额：500,000`;
    const result = parseGoalKeyValueFormat(input, "marriage_child");
    expect(result.ok).toBe(true);
    const data = result.data!;
    expect(data.goal_type).toBe("marriage_child");
    const constraints = data.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("平衡型");
    expect(constraints.goal_type).toBe("marriage_child");
    expect(constraints.dca_completion_months).toBe("12个月");
    expect(constraints.start_invest_date).toBe("2026-07-04");
    expect(constraints.money_needed_date).toBe("2028-12-01");
    expect(constraints.target_amount).toBe(500000);
  });

  it("housing: perfect key-value input", () => {
    const input = `【买房规划】
风险偏好：稳健型
一次性投入：300,000
每月投入：8,000
目标年化收益：7%
最大回撤承受：10%
定投期限：12个月
开始投资日期：2026-07-01
需要用款日期：2028-06-30`;
    const result = parseGoalKeyValueFormat(input, "housing");
    expect(result.ok).toBe(true);
    const data = result.data!;
    expect(data.goal_type).toBe("housing");
    const constraints = data.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("稳健型");
    expect(constraints.goal_type).toBe("housing");
    expect(constraints.dca_completion_months).toBe("12个月");
    expect(constraints.start_invest_date).toBe("2026-07-01");
    expect(constraints.money_needed_date).toBe("2028-06-30");
    expect(constraints.principal_amount).toBe(300000);
    expect(constraints.monthly_amount).toBe(8000);
  });

  it("education: perfect key-value input", () => {
    const input = `【子女教育】
风险偏好：平衡型
一次性投入：150,000
每月投入：6,000
目标年化收益：6%
最大回撤承受：15%
定投期限：12个月
开始投资日期：2026-09-01
需要用款日期：2035-09-01`;
    const result = parseGoalKeyValueFormat(input, "education");
    expect(result.ok).toBe(true);
    const data = result.data!;
    expect(data.goal_type).toBe("education");
    const constraints = data.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("平衡型");
    expect(constraints.goal_type).toBe("education");
    expect(constraints.dca_completion_months).toBe("12个月");
    expect(constraints.start_invest_date).toBe("2026-09-01");
    expect(constraints.money_needed_date).toBe("2035-09-01");
    expect(constraints.principal_amount).toBe(150000);
    expect(constraints.monthly_amount).toBe(6000);
  });

  it("wealth_growth: perfect key-value input", () => {
    const input = `【财富增值】
风险偏好：进取型
一次性投入：500,000
每月投入：20,000
目标年化收益：12%
最大回撤承受：25%
定投期限：12个月
投资期限：5年`;
    const result = parseGoalKeyValueFormat(input, "wealth_growth");
    expect(result.ok).toBe(true);
    const data = result.data!;
    expect(data.goal_type).toBe("wealth_growth");
    const constraints = data.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("进取型");
    expect(constraints.goal_type).toBe("wealth_growth");
    expect(constraints.dca_completion_months).toBe("12个月");
    expect(constraints.investment_duration).toBe("5年");
    expect(constraints.principal_amount).toBe(500000);
    expect(constraints.monthly_amount).toBe(20000);
    expect(constraints.target_return).toBe(12);
  });

  // ── Edge cases ──

  it("returns error for empty input", () => {
    const result = parseGoalKeyValueFormat("   ", "retirement");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("输入为空");
  });

  it("accepts input without 【】title (title is optional)", () => {
    const input = `风险偏好：稳健型
一次性投入：100,000`;
    const result = parseGoalKeyValueFormat(input, "retirement");
    // Should not fail on missing title — only on missing required fields
    expect(result.ok).toBe(false);
    expect(result.error).not.toBe("缺少【标题】格式");
  });

  it("returns error for missing required fields (retirement)", () => {
    const input = `【退休养老】
风险偏好：稳健型
一次性投入：100,000`;
    const result = parseGoalKeyValueFormat(input, "retirement");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/解析失败/);
  });

  it("returns error for missing required fields (marriage_child)", () => {
    const input = `【结婚生育】
风险偏好：平衡型
一次性投入：200,000
每月投入：10,000
目标年化收益：8%
最大回撤承受：20%`;
    const result = parseGoalKeyValueFormat(input, "marriage_child");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/缺少开始投资日期/);
  });

  it("handles Chinese comma in numbers (150,000 → 150000)", () => {
    const input = `【买房规划】
风险偏好：稳健型
一次性投入：150,000 元
每月投入：5,000
目标年化收益：7%
最大回撤承受：10%
开始投资日期：2026-07-01
需要用款日期：2028-06-30`;
    const result = parseGoalKeyValueFormat(input, "housing");
    expect(result.ok).toBe(true);
    const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.principal_amount).toBe(150000);
    expect(constraints.monthly_amount).toBe(5000);
  });

  it("handles alternative field names (retirement aliases)", () => {
    const input = `【退休养老】
风险类型：稳健型
一次性投入：200,000
每月投入：10,000
目标年化收益：5%
最大回撤：10%
退休日期：2050-06-01
退休后月支出：8,000`;
    const result = parseGoalKeyValueFormat(input, "retirement");
    expect(result.ok).toBe(true);
    const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.risk_tolerance).toBe("稳健型");
    expect(constraints.money_needed_start_date).toBe("2050-06-01");
    expect(constraints.monthly_retirement_spending).toBe(8000);
  });

  it("resolves correct title when text contains 【场景名】", () => {
    // While the title is parsed independently, test that the function works
    // with realistic text that has both title and kv pairs
    const text = `【退休养老】
风险偏好：稳健型
一次性投入：100,000
每月投入：5,000
目标年化收益：6%
最大回撤承受：15%
退休金领取日期：2055-01-01
每月退休生活支出：6,000`;
    expect(resolveGoalTypeFromMessage(text)).toBe("retirement");
  });

  it("resolves correct goal type for each scenario title", () => {
    expect(resolveGoalTypeFromMessage("【退休养老】\n风险偏好：稳健型")).toBe("retirement");
    expect(resolveGoalTypeFromMessage("【子女教育】\n风险偏好：平衡型")).toBe("education");
    expect(resolveGoalTypeFromMessage("【买房规划】\n风险偏好：稳健型")).toBe("housing");
    expect(resolveGoalTypeFromMessage("【结婚生育】\n风险偏好：平衡型")).toBe("marriage_child");
    expect(resolveGoalTypeFromMessage("【财富增值】\n风险偏好：进取型")).toBe("wealth_growth");
  });

  // ── EXAMPLE_SECTIONS format (计划开始日期 / 资金需求日期) ──

  it("education: handles EXAMPLE_SECTIONS field names", () => {
    const input = `【子女教育】
风险偏好：平衡型
一次性投入：50,000 元
每月投入：3,000 元
目标年化收益：7%
最大回撤承受：10%
计划开始日期：2025-01-01
资金需求日期：2038-09-01`;
    const result = parseGoalKeyValueFormat(input, "education");
    expect(result.ok).toBe(true);
    const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.start_invest_date).toBe("2025-01-01");
    expect(constraints.money_needed_date).toBe("2038-09-01");
    expect(constraints.risk_tolerance).toBe("平衡型");
    expect(constraints.principal_amount).toBe(50000);
    expect(constraints.monthly_amount).toBe(3000);
  });

  it("housing: handles EXAMPLE_SECTIONS field names", () => {
    const input = `【购房置业】
风险偏好：保守型
一次性投入：200,000 元
每月投入：8,000 元
目标年化收益：5%
最大回撤承受：5%
计划开始日期：2025-01-01
资金需求日期：2028-06-01`;
    const result = parseGoalKeyValueFormat(input, "housing");
    expect(result.ok).toBe(true);
    const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.start_invest_date).toBe("2025-01-01");
    expect(constraints.money_needed_date).toBe("2028-06-01");
    expect(constraints.risk_tolerance).toBe("保守型");
    expect(constraints.principal_amount).toBe(200000);
    expect(constraints.monthly_amount).toBe(8000);
  });

  it("marriage_child: handles EXAMPLE_SECTIONS field names", () => {
    const input = `【结婚生育】
风险偏好：平衡型
一次性投入：80,000 元
每月投入：3,000 元
目标年化收益：6%
最大回撤承受：10%
计划开始日期：2025-01-01
资金需求日期：2027-12-01
目标金额：500,000 元`;
    const result = parseGoalKeyValueFormat(input, "marriage_child");
    expect(result.ok).toBe(true);
    const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
    expect(constraints.start_invest_date).toBe("2025-01-01");
    expect(constraints.money_needed_date).toBe("2027-12-01");
    expect(constraints.target_amount).toBe(500000);
    expect(constraints.risk_tolerance).toBe("平衡型");
    expect(constraints.principal_amount).toBe(80000);
    expect(constraints.monthly_amount).toBe(3000);
  });

  it("parses 定投期限 from all scenario example formats", () => {
    const cases: Array<[string, string]> = [
      ["retirement", `【退休养老】
风险偏好：稳健型
计划开始日期：2025-01-01
资金需求日期：2055-01-01
每月退休生活支出：15,000 元
一次性投入：100,000 元
每月投入：5,000 元
目标年化收益：6%
最大回撤承受：15%
定投期限：12个月`],
      ["education", `【子女教育】
风险偏好：平衡型
计划开始日期：2025-01-01
资金需求日期：2038-09-01
一次性投入：50,000 元
每月投入：3,000 元
目标年化收益：7%
最大回撤承受：10%
定投期限：12个月`],
      ["housing", `【购房置业】
风险偏好：保守型
计划开始日期：2025-01-01
资金需求日期：2028-06-01
一次性投入：200,000 元
每月投入：8,000 元
目标年化收益：5%
最大回撤承受：5%
定投期限：12个月`],
      ["marriage_child", `【结婚生育】
风险偏好：平衡型
计划开始日期：2025-01-01
资金需求日期：2027-12-01
目标金额：500,000 元
一次性投入：80,000 元
每月投入：3,000 元
目标年化收益：6%
最大回撤承受：10%
定投期限：12个月`],
      ["wealth_growth", `【财富增值】
风险偏好：进取型
投资期限：5年
一次性投入：300,000 元
每月投入：10,000 元
目标年化收益：10%
最大回撤承受：20%
定投期限：12个月`],
    ];

    for (const [goalType, input] of cases) {
      const result = parseGoalKeyValueFormat(input, goalType as GoalType);
      expect(result.ok).toBe(true);
      const constraints = result.data!.investment_constraints as unknown as Record<string, unknown>;
      expect(constraints.dca_completion_months).toBe("12个月");
    }
  });
});

describe("resolveGoalTypeFromMessage", () => {
  it("returns null for key-value formatted basic info text", () => {
    const text = `姓名：徐美丽
年龄：35 岁
性别：女
婚姻状况：已婚
子女情况：一孩
职业：软件工程师
投资经验：3年
税后年收入：300,000 元`;
    expect(resolveGoalTypeFromMessage(text)).toBeNull();
  });

  it("returns null for short text with 子女 keyword", () => {
    // Short text (< 3 kv lines) should still match
    expect(resolveGoalTypeFromMessage("子女教育")).toBe("education");
  });

  it("matches goal keywords in simple messages", () => {
    expect(resolveGoalTypeFromMessage("我想了解养老规划")).toBe("retirement");
    expect(resolveGoalTypeFromMessage("买房相关")).toBe("housing");
    expect(resolveGoalTypeFromMessage("结婚生育")).toBe("marriage_child");
    expect(resolveGoalTypeFromMessage("财富增值")).toBe("wealth_growth");
  });

  it("detects goal type from key-value text with constraint fields (no title)", () => {
    // Example: education scenario without 【子女教育】 prefix
    const educationText = `风险偏好：平衡型
计划开始日期：2025-01-01
资金需求日期：2038-09-01
一次性投入：50,000 元（子女教育）`;
    expect(resolveGoalTypeFromMessage(educationText)).toBe("education");

    // Retirement scenario
    const retirementText = `风险偏好：稳健型
退休金领取日期：2055-01-01
每月退休生活支出：15,000 元`;
    expect(resolveGoalTypeFromMessage(retirementText)).toBe("retirement");

    // Housing scenario
    const housingText = `风险偏好：保守型
计划开始日期：2025-01-01
资金需求日期：2028-06-01（购房首付）`;
    expect(resolveGoalTypeFromMessage(housingText)).toBe("housing");

    // Marriage scenario
    const marriageText = `风险偏好：平衡型
计划开始日期：2025-01-01
目标金额：500,000 元（结婚生育）`;
    expect(resolveGoalTypeFromMessage(marriageText)).toBe("marriage_child");

    // Wealth growth scenario
    const wealthText = `风险偏好：进取型
投资期限：3-5年（财富增值）
一次性投入：300,000 元`;
    expect(resolveGoalTypeFromMessage(wealthText)).toBe("wealth_growth");
  });
});
