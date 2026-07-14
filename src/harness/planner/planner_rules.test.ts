import { describe, expect, it } from "vitest";
import {
  handoffAutostartPlan,
  portfolioAutostartPlan,
  runPlannerRules,
} from "@/harness/planner/planner_rules";

describe("runPlannerRules", () => {
  it("returns capability reply intent", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "你能做什么",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.steps[0].key).toBe("capability");
  });

  it("handoff from chat to profile", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "我想做理财规划",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("profile");
  });

  it("handoff from chat when user says 我要梳理我的投资需求", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "我要梳理我的投资需求",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("profile");
  });

  it("handoff from chat when user says 帮我梳理养老投资需求", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "帮我梳理养老投资需求",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("profile");
  });

  it("profile scene_task for intake", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "帮我梳理投资需求",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.skill === "profile_intake")).toBe(true);
  });
});

describe("D3: fine-grained planner intents", () => {
  // —— profile 场景 ——
  it("profile: 报告生成", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "生成投资需求报告",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps[0].key).toBe("profile.report.draft");
  });

  it("profile: 重新开始", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "重新开始",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps[0].key).toBe("profile.reset");
  });

  it("profile: 空泛修改意图 → 先沟通", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "修改投资画像",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it("profile: 我想修改投资画像 → 先沟通", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "我想修改投资画像",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it("profile: 短问 fallback", () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "今天天气怎么样",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps[0].key).toBe("profile_intake");
  });

  // —— plan 场景 ——
  it("plan: 生成方案", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "帮我生成资产配置方案",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "plan.s1.allocation")).toBe(true);
  });

  it("plan: 报告生成时不应出现大类资产配置步骤", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "生成【退休养老】资产配置报告",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.every((s) => s.key !== "plan.s1.allocation")).toBe(true);
    expect(plan.steps.some((s) => s.key === "plan.prep.check")).toBe(true);
  });

  it("plan: 校准方案", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "校准一下方案",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps[0].key).toBe("plan.read.current");
  });

  it("plan: 短问 fallback", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "什么是股债平衡",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it("plan: 空泛修改配置方案 → 先沟通", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "修改配置方案",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it("plan: 调整一下方案 → 先沟通", () => {
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "调整一下方案",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  // —— portfolio 场景 ——
  it("portfolio: 重新分析", () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "重新分析我的持仓",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.map((s) => s.key)).toEqual([
      "port.prep.read",
      "port.rpt.gather.l0",
      "port.rpt.draft.tpl",
      "port.rpt.draft.compose",
      "port.rpt.draft.verify",
    ]);
  });

  it("portfolio: 具体持仓录入 → 走变更管线", () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "新增 000198 10000元 2026-01-05 买入",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "port.hold.input")).toBe(true);
  });

  it("portfolio: 空泛修改意向 → 展示持仓指引", () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "我想修改持仓",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "port.hold.guide")).toBe(true);
  });

  it("portfolio: 我要修改持仓 → 展示持仓指引", () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "我要修改持仓",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "port.hold.guide")).toBe(true);
  });

  it("portfolio: 短问 fallback", () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "什么是再平衡",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  // —— fund 场景 ——
  it("fund: 完整解读报告", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "出具完整基金解读报告",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "fund.rpt.draft.compose")).toBe(true);
  });

  it("fund: 重新生成报告", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "重新生成报告",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "fund.rpt.draft.compose")).toBe(true);
  });

  it("fund: 自选管理", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "加自选",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps[0].key).toBe("fund.watchlist.add");
  });

  it("fund: 基金问答", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "000001管理费多少",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "fund.qa.understand")).toBe(true);
  });

  it("fund: 短问 fallback 含检索节点", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "你好",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.steps.map((s) => s.key)).toEqual([
      "fund.qa.understand",
      "fund.qa.answer",
    ]);
  });

  it("fund: 重新发起解读报告", () => {
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "重新发起基金解读",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key === "fund.rpt.draft.compose")).toBe(true);
  });

  // —— 跨场景 handoff ——
  it("chat: handoff to portfolio", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "我想做持仓分析",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("portfolio");
  });

  it("chat: handoff to fund", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "基金解读",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("fund");
  });

  it("chat: handoff to plan", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "帮我做资产配置",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("plan");
  });

  it("chat: general question is simple_qa", () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "今天天气怎么样",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it("portfolioAutostartPlan: 有持仓时直接开始完整分析", async () => {
    const plan = await portfolioAutostartPlan(true);
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.map((s) => s.key)).toEqual([
      "port.prep.read",
      "port.rpt.gather.l0",
      "port.rpt.draft.tpl",
      "port.rpt.draft.compose",
      "port.rpt.draft.verify",
    ]);
  });

  it("portfolioAutostartPlan: 无持仓时引导录入", async () => {
    const plan = await portfolioAutostartPlan(false);
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.map((s) => s.key)).toEqual(["port.hold.input"]);
  });

  it("handoffAutostartPlan: plan uses scene_task", async () => {
    const plan = await handoffAutostartPlan("plan");
    expect(plan?.intent).toBe("scene_task");
    expect(plan?.steps.some((s) => s.key === "plan.prep.check")).toBe(true);
  });
});
