import type { SceneId } from "@/harness/registry/load";
import type { ExecutionPlan, MessageRow } from "@/harness/types";
import { isFundFullReportIntent } from "@/lib/fund/report-intent";
import { holdingsRead } from "@/lib/portfolio/read";
import { parseReportDeepLink } from "@/lib/reports/parse-report-link";
import { getSupabase } from "@/lib/supabase/server";

export const CAPABILITY_REPLY = `我是你的**理财助手**，可以帮你完成三件「有报告留痕」的事，也可以随时聊聊：

1. **投资规划** — 先完善投资需求与目标约束，再生成可解释的资产配置方案，并输出 **《投资规划书》**
2. **持仓分析** — 录入持仓后做组合诊断；有目标方案时可给再平衡参考，并输出 **《持仓分析报告》**
3. **基金解读** — 单只公募深度分析，并输出 **《单只基金分析报告》**
4. **自由交流** — 基金、市场、理财相关问题；任意 Tab 在已配置图片理解时均可发截图提问；复杂需求会引导你到上面三步

**范围说明**：规划、持仓与基金解读中的基金产品仅覆盖中国公募基金；自由问答可结合公开网络信息交流更广泛的话题。

建议路径：**需求梳理 → 资产配置 → 持仓分析 → 基金解析**。你也可以只研究某一只基金，或先随便聊聊。

*以上均为信息参考，不构成投资建议。*`;

function isCapabilityQuestion(text: string): boolean {
  return /你能做什么|你会什么|有什么功能|能帮我什么/.test(text);
}

/** chat Tab 跨场景 handoff 话术（须先出跳转卡，禁止在自由问答内直接跑正式流程） */
function isChatCrossSceneHandoff(text: string): boolean {
  return /需求梳理|资产配置|持仓分析|基金解读|理财规划|帮我规划|整理投资需求|梳理.{0,12}投资需求|投资需求.{0,12}梳理/.test(
    text,
  );
}

export function profileAutostartPlan(): ExecutionPlan {
  return {
    intent: "scene_task",
    steps: [
      {
        key: "profile_intake",
        label: "整理基本情况",
        skill: "profile_intake",
        status: "pending",
      },
      {
        key: "goal_intake",
        label: "整理投资需求",
        skill: "goal_constraint_intake",
        status: "pending",
      },
    ],
    requires_user_confirm: false,
    reasoning_summary: "Handoff 自动开跑需求梳理。",
  };
}

export function planAutostartPlan(): ExecutionPlan {
  return {
    intent: "scene_task",
    steps: [
      { key: "plan.prep.check", label: "校验投资需求完善", skill: "plan_allocation", status: "pending" },
      { key: "plan.s1.allocation", label: "进行大类资产规划", skill: "plan_allocation", status: "pending" },
    ],
    requires_user_confirm: false,
    reasoning_summary: "Handoff 自动开跑资产配置。",
  };
}

export async function portfolioAutostartPlan(
  hasCurrentHoldings: boolean,
): Promise<ExecutionPlan> {
  if (hasCurrentHoldings) {
    return {
      intent: "scene_task",
      steps: [
        {
          key: "port.prep.read",
          label: "读取当前持仓",
          skill: "portfolio_read",
          status: "pending",
        },
        {
          key: "port.rpt.gather.l0",
          label: "同步各持仓基金行情与分红",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.tpl",
          label: "整理持仓表与图表",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.compose",
          label: "撰写分析导语与要点",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.verify",
          label: "核对报告结构与图表",
          skill: "portfolio_report",
          status: "pending",
        },
      ],
      requires_user_confirm: false,
      reasoning_summary: "当前已有持仓，直接开始持仓分析。",
    };
  }

  return {
    intent: "scene_task",
    steps: [
      {
        key: "port.hold.input",
        label: "起草修改方案",
        skill: "portfolio_intake",
        status: "pending",
      },
    ],
    requires_user_confirm: false,
    reasoning_summary: "Handoff 自动开跑持仓分析。",
  };
}

export function fundAutostartPlan(): ExecutionPlan {
  return {
    intent: "scene_task",
    steps: [
      {
        key: "fund.qa.understand",
        label: "理解您的问题",
        skill: "fund_analysis",
        status: "pending",
      },
      {
        key: "fund.qa.answer",
        label: "检索基金资料",
        skill: "fund_analysis",
        status: "pending",
      },
    ],
    requires_user_confirm: false,
    reasoning_summary: "Handoff 自动开跑基金解读。",
  };
}

/** Handoff「前往」后空消息开跑 · PRD §5.13.1 */
export async function handoffAutostartPlan(
  scene: SceneId,
): Promise<ExecutionPlan | null> {
  switch (scene) {
    case "profile":
      return profileAutostartPlan();
    case "plan":
      return planAutostartPlan();
    case "portfolio": {
      const supabase = await getSupabase();
      const read = await holdingsRead(supabase);
      return portfolioAutostartPlan(read.has_current);
    }
    case "fund":
      return fundAutostartPlan();
    default:
      return null;
  }
}

export function runPlannerRules(input: {
  scene: SceneId;
  userMessage: string;
  history: MessageRow[];
}): ExecutionPlan {
  const text = input.userMessage.trim();

  if (isCapabilityQuestion(text)) {
    return {
      intent: "simple_qa",
      steps: [{ key: "capability", label: "介绍能力", status: "pending" }],
      requires_user_confirm: false,
      reasoning_summary: "识别为能力介绍请求。",
    };
  }

  if (parseReportDeepLink(text)) {
    return {
      intent: "simple_qa",
      steps: [{ key: "report_read", label: "读取已发布报告", status: "pending" }],
      requires_user_confirm: false,
      reasoning_summary: "消息含已发布报告深链，先读取报告再回答。",
    };
  }

  // D3: 更细粒度的 intent 分类

  // —— profile 场景 ——
  // 注意：报告生成须在 intake 之前匹配，因为"投资需求"会同时命中 intake 规则
  if (
    input.scene === "profile" &&
    /报告|草稿|发布|确认.*投资需求|生成.*报告/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "profile.report.draft", label: "撰写投资需求报告", skill: "profile_report", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为投资需求报告生成流程。",
    };
  }

  if (
    input.scene === "profile" &&
    /梳理|问卷|填写需求|完善需求/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "profile_intake", label: "整理基本情况", skill: "profile_intake", status: "pending" },
        { key: "goal_intake", label: "整理投资需求", skill: "goal_constraint_intake", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为需求梳理正式流程。",
    };
  }

  if (
    input.scene === "profile" &&
    /重新开始|重来|从头/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "profile.reset", label: "重新梳理需求", skill: "profile_intake", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为重新开始需求梳理。",
    };
  }

  // profile: 空泛修改意图 → 先走简单问答沟通，不直接触发进度条
  if (
    input.scene === "profile" &&
    /^(我想|我要|帮我)?(修改|更新|调整|改).*?投资画像[？?]?$/.test(text)
  ) {
    return {
      intent: "simple_qa",
      steps: [
        { key: "understand", label: "理解对话", status: "pending" },
        { key: "answer", label: "组织回答", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "用户表达了修改投资画像意向，先询问具体变更内容。",
    };
  }

  // —— plan 场景 ——

  // plan: 空泛修改/调整意图 → 先走简单问答沟通，不直接触发变更管线
  if (
    input.scene === "plan" &&
    /^(我想|我要|帮我)?(修改|调整|更新|改).*?(配置方案|方案)[？?]?$/.test(text)
  ) {
    return {
      intent: "simple_qa",
      steps: [
        { key: "understand", label: "理解对话", status: "pending" },
        { key: "answer", label: "组织回答", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "用户表达了修改配置方案意向，先询问具体变更内容。",
    };
  }

  // Step 2: 基金明细（"生成明细"、"基金明细"等）— 必须在通用 plan 分支之前
  if (
    input.scene === "plan" &&
    /生成明细|基金明细|联网明细|正式明细|出明细|明细方案|选基金/.test(text) &&
    !/样例/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "plan.prep.check", label: "校验投资需求完善", skill: "plan_allocation", status: "pending" },
        { key: "plan.s2.detail", label: "进行基金明细筛选", skill: "plan_allocation", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为基金明细生成流程。",
    };
  }

  // plan: 基金替换/重新推荐（对XXX不满意 / 换掉XXX / 重新推荐基金）
  if (
    input.scene === "plan" &&
    /\b\d{6}\b/.test(text) &&
    /不满意|换掉|更换|替换|换走|去掉|淘汰|不喜欢|不合适|不想要|不想|不好看|换一?只|替一?只|重新推荐/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "plan.prep.check", label: "校验投资需求完善", skill: "plan_allocation", status: "pending" },
        { key: "plan.s2.detail.replace", label: "替换基金", skill: "plan_allocation", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为基金替换/重新推荐流程。",
    };
  }

  // 报告生成：大类的资产配置已经完成，只需 prep.check → 撰写报告
  if (
    input.scene === "plan" &&
    /生成【.+?】资产配置报告/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "plan.prep.check", label: "校验投资需求完善", skill: "report_draft", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为报告生成流程。",
    };
  }

  if (
    input.scene === "plan" &&
    /开始|生成方案|资产配置|配置基金|大类|明细|规划书|样例|\/plan_read|生成明细/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "plan.prep.check", label: "校验投资需求完善", skill: "plan_allocation", status: "pending" },
        { key: "plan.s1.allocation", label: "进行大类资产规划", skill: "plan_allocation", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为资产配置正式流程。",
    };
  }

  if (
    input.scene === "plan" &&
    /校准|调整|修改方案|更新方案|重新生成/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "plan.read.current", label: "读取当前方案", skill: "plan_read", status: "pending" },
        { key: "plan.s1.allocation", label: "重新进行大类资产规划", skill: "plan_allocation", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为方案校准/调整流程。",
    };
  }

  // —— portfolio 场景 ——
  if (
    input.scene === "portfolio" &&
    /重新分析|持仓分析|生成.*报告|持仓报告/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        {
          key: "port.prep.read",
          label: "读取当前持仓",
          skill: "portfolio_read",
          status: "pending",
        },
        {
          key: "port.rpt.gather.l0",
          label: "同步各持仓基金行情与分红",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.tpl",
          label: "整理持仓表与图表",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.compose",
          label: "撰写分析导语与要点",
          skill: "portfolio_report",
          status: "pending",
        },
        {
          key: "port.rpt.draft.verify",
          label: "核对报告结构与图表",
          skill: "portfolio_report",
          status: "pending",
        },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为持仓分析报告生成流程。",
    };
  }

  // —— portfolio: 有具体数据（基金代码/日期） → 文字解析 + 确认卡 ——
  const hasExplicitHoldingsChange =
    /\b\d{6}\b/.test(text) || /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(text);
  const hasExplicitChangeVerb =
    /新增|卖出|加仓|减仓|调仓|换仓|赎回|买入|现金分红|红利再投|强增|强减|份额调整/.test(text);
  if (
    input.scene === "portfolio" &&
    hasExplicitHoldingsChange
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "port.hold.input", label: "起草修改方案", skill: "portfolio_intake", status: "pending" },
        { key: "port.hold.propose", label: "确认并保存", skill: "holdings_propose", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为具体持仓变更流程。",
    };
  }

  // —— portfolio: 有操作意图但无具体数据 → 展示持仓与操作指引 ——
  if (
    input.scene === "portfolio" &&
    hasExplicitChangeVerb
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "port.hold.guide", label: "展示持仓与操作指引", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "用户表达了持仓操作意图，展示当前持仓与操作指引。",
    };
  }

  // —— portfolio: 空泛修改意图 → 展示当前持仓与操作指引 ——
  if (
    input.scene === "portfolio" &&
    /^(我想|我要|帮我)?(修改|更新|调整|录入).*?(持仓|仓位|持有|基金)?[？?]?$|^(持仓|仓位).*?(修改|更新|调整|录入)/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "port.hold.guide", label: "展示持仓与操作指引", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "用户表达了修改持仓意向，展示当前持仓与操作指引。",
    };
  }

  // —— portfolio: 查看/展示持仓 → 展示当前持仓与操作指引 ——
  if (
    input.scene === "portfolio" &&
    /(查看|看|展示|显示|我的|当前|有哪些|有什么).*持仓/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "port.hold.guide", label: "展示持仓与操作指引", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "用户想要查看当前持仓。",
    };
  }

  // —— fund 场景 ——
  if (input.scene === "fund" && isFundFullReportIntent(text)) {
    return {
      intent: "scene_task",
      steps: [
        { key: "fund.prep.lookup", label: "确认基金档案", skill: "fund_analysis", status: "pending" },
        { key: "fund.prep.l0_sync", label: "同步行情、费率与持仓", skill: "fund_analysis", status: "pending" },
        { key: "fund.rpt.draft.compose", label: "撰写解读报告", skill: "fund_report", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为基金完整解读报告流程。",
    };
  }

  if (
    input.scene === "fund" &&
    /自选|加自选|加入自选|关注|收藏/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "fund.watchlist.add", label: "添加自选基金", skill: "fund_watchlist", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为基金自选添加流程。",
    };
  }

  if (
    input.scene === "fund" &&
    /fund_lookup|\d{6}|管理费|业绩|基金|稳|风险|适合|费率|净值|回撤/.test(text)
  ) {
    return {
      intent: "scene_task",
      steps: [
        { key: "fund.qa.understand", label: "理解基金问题", skill: "fund_analysis", status: "pending" },
        { key: "fund.qa.answer", label: "检索并回答", skill: "fund_analysis", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为基金单点简答。",
    };
  }

  // —— 跨场景 handoff ——
  if (input.scene === "chat" && isChatCrossSceneHandoff(text)) {
    const target: SceneId = /持仓/.test(text)
      ? "portfolio"
      : /基金|解读/.test(text)
        ? "fund"
        : /资产|配置|方案/.test(text)
          ? "plan"
          : "profile";

    return {
      intent: "cross_scene_handoff",
      target_scene: target,
      steps: [{ key: "handoff", label: "确认是否跳转", status: "pending" }],
      requires_user_confirm: true,
      reasoning_summary: "识别为用户可能需要进入正式流程，先确认是否跳转。",
    };
  }

  // —— 通用短问 ——
  if (input.scene !== "chat" && /什么是|解释|怎么理解|区别|含义|如何/.test(text)) {
    return {
      intent: "simple_qa",
      steps: [
        { key: "understand", label: "理解问题", status: "pending" },
        { key: "answer", label: "组织回答", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "当前 Tab 下的概念短问。",
    };
  }

  if (input.scene === "fund") {
    return {
      intent: "simple_qa",
      steps: [
        { key: "fund.qa.understand", label: "理解您的问题", status: "pending" },
        { key: "fund.qa.answer", label: "检索基金资料", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "基金 Tab 短问，先理解再检索资料。",
    };
  }

  // —— profile 场景兜底：未匹配的 profile 消息应走 profile 流程，而非自由问答 ——
  if (input.scene === "profile") {
    return {
      intent: "scene_task",
      steps: [
        { key: "profile_intake", label: "整理基本情况", skill: "profile_intake", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "识别为投资需求梳理流程。",
    };
  }

  if (input.scene !== "chat") {
    return {
      intent: "simple_qa",
      steps: [
        { key: "understand", label: "理解问题", status: "pending" },
        { key: "answer", label: "组织回答", status: "pending" },
      ],
      requires_user_confirm: false,
      reasoning_summary: "当前消息未匹配场景正式流程，按短问回答。",
    };
  }

  return {
    intent: "simple_qa",
    steps: [
      { key: "understand", label: "理解问题", status: "pending" },
      { key: "answer", label: "组织回答", status: "pending" },
    ],
    requires_user_confirm: false,
    reasoning_summary: "识别为自由问答短问。",
  };
}
