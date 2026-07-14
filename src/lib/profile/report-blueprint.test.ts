import { describe, expect, it } from "vitest";
import { loadSampleBasicPayload } from "./propose";
import { loadSampleGoalPayload } from "./goal-constraint";
import {
  buildProfileReportMarkdown,
  buildThreeSentencesDraft,
  deriveRelativeMetrics,
} from "./report-blueprint";
import {
  pickAcceptedLlmSection,
  validateProfileLlmSections,
  validateUnderstandingQuality,
} from "./report-llm-quality";
import { verifyProfileReportDraft } from "@/harness/tools/profile_report_verify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("profile report-blueprint", () => {
  it("builds full markdown with intro blocks and seven body chapters", () => {
    const basic = loadSampleBasicPayload().basic_info;
    const goal = loadSampleGoalPayload();
    const { markdown, echartsCount } = buildProfileReportMarkdown({
      sceneName: "退休养老",
      goalType: "retirement",
      dateLabel: "2026年6月22日",
      ymd: "20260622",
      basicInfo: basic,
      constraints: goal.investment_constraints,
      principalAmount: goal.investment_constraints.principal_amount,
      monthlyAmount: goal.investment_constraints.monthly_amount,
    });

    expect(markdown).toContain("## 1 基础信息");
    expect(markdown).toContain("## 2 投资场景");
    expect(markdown).toContain("张先生");
    expect(echartsCount).toBeGreaterThanOrEqual(0);
    expect(echartsCount).toBeLessThanOrEqual(2);
  });

  it("derives relative metrics for retirement sample", () => {
    const basic = loadSampleBasicPayload().basic_info;
    const goal = loadSampleGoalPayload();
    const metrics = deriveRelativeMetrics({
      sceneName: "退休养老",
      goalType: "retirement",
      dateLabel: "2026年6月22日",
      ymd: "20260622",
      basicInfo: basic,
      constraints: goal.investment_constraints,
      principalAmount: goal.investment_constraints.principal_amount,
      monthlyAmount: goal.investment_constraints.monthly_amount,
    });

    expect(metrics.principal_pct_of_assets).toBeCloseTo(0.24, 2);
    expect(metrics.monthly_pct_of_investable).toBeCloseTo(3000 / 3500, 2);
    expect(metrics.risk_coherence).toContain("匹配");
  });

  it("avoids duplicate wealth_growth phrasing", () => {
    const basic = loadSampleBasicPayload().basic_info;
    const wealthInput = {
      sceneName: "财富增值",
      goalType: "wealth_growth" as const,
      dateLabel: "2026年6月22日",
      ymd: "20260622",
      basicInfo: basic,
      constraints: {
        goal_type: "wealth_growth" as const,
        investment_duration: "5 年以上",
        risk_tolerance: "平衡",
        max_drawdown: "约 -20%",
        target_return: 5.5,
        principal_amount: 100000,
        monthly_amount: 300,
        dca_completion_months: "12月",
      },
      principalAmount: 100000,
      monthlyAmount: 300,
    };
    const wealthDraft = buildThreeSentencesDraft(
      wealthInput,
      deriveRelativeMetrics(wealthInput),
    );
    expect(wealthDraft).not.toMatch(/非应急消费金[\s\S]*非应急消费金/);
  });
});

describe("profile report-llm-quality", () => {
  it("rejects internal terms and fund codes in LLM sections", () => {
    const badU = "**1. 建议买入** 某基金\n**2. 股票 60%**\n**3. 去资产配置 Tab**";
    expect(validateUnderstandingQuality(badU).ok).toBe(false);
  });

  it("rejects market opinion in understanding section", () => {
    const bad =
      "**1. 本组角色** 测试\n**2. 当前市场牛市** 不宜\n**3. 执行** ok";
    expect(validateUnderstandingQuality(bad).ok).toBe(false);
  });

  it("falls back to rule draft when polished section fails QA", () => {
    const fallback = "**1. 资金性质** 测试\n**2. 风险偏好** 稳健\n**3. 执行节奏** 每月 3,000 元占月可投 86%";
    const bad = "**1. 资金性质** goal_detail 泄漏";
    expect(pickAcceptedLlmSection(bad, fallback)).toBe(fallback);
  });
});

describe("profile_report_verify", () => {
  it("passes verify on composed retirement draft", () => {
    const basic = loadSampleBasicPayload().basic_info;
    const goal = loadSampleGoalPayload();
    const { markdown } = buildProfileReportMarkdown({
      sceneName: "退休养老",
      goalType: "retirement",
      dateLabel: "2026年6月22日",
      ymd: "20260622",
      basicInfo: basic,
      constraints: goal.investment_constraints,
      principalAmount: goal.investment_constraints.principal_amount,
      monthlyAmount: goal.investment_constraints.monthly_amount,
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-rpt-"));
    const draftPath = path.join(dir, "draft-report.md");
    fs.writeFileSync(draftPath, markdown, "utf8");
    fs.writeFileSync(
      `${draftPath.replace(/draft-report\.md$/, "draft-meta.json")}`,
      JSON.stringify({
        report_type: "profile",
        conversation_id: "c1",
        run_id: "r1",
        goal_type: "retirement",
      }),
      "utf8",
    );

    const result = verifyProfileReportDraft({ draftPath });
    expect(result.ok).toBe(true);
    expect(validateProfileLlmSections(markdown).ok).toBe(true);
  });
});
