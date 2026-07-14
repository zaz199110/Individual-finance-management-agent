import { ensureModelSlot } from "@/lib/supabase/server";
import { completeText } from "@/lib/llm/invoke";
import type { SlotConfig } from "@/lib/config/model-providers";
import type { SceneId } from "@/harness/registry/load";
import { loadSkillIndex } from "@/harness/skills/loader";
import type { ExecutionPlan, Intent, MessageRow } from "@/harness/types";
import { runPlannerRules, CAPABILITY_REPLY } from "./planner_rules";

export { CAPABILITY_REPLY };

const AMBIGUOUS_RULES_REASONING = new Set([
  "识别为自由问答短问。",
  "当前消息未匹配场景正式流程，按短问回答。",
  "基金 Tab 短问，先理解再检索资料。",
]);

export function isAmbiguousRulesPlan(plan: ExecutionPlan): boolean {
  return AMBIGUOUS_RULES_REASONING.has(plan.reasoning_summary ?? "");
}

const VALID_INTENTS: Intent[] = [
  "simple_qa",
  "scene_task",
  "cross_scene_handoff",
];

function parsePlanJson(raw: string): ExecutionPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[0]) as ExecutionPlan;
    if (!VALID_INTENTS.includes(json.intent)) return null;
    if (json.intent === "cross_scene_handoff" && json.target_scene) {
      const VALID_SCENES = new Set(["chat", "profile", "plan", "portfolio", "fund"]);
      if (!VALID_SCENES.has(json.target_scene)) {
        json.target_scene = undefined;
      }
    }
    if (!Array.isArray(json.steps)) json.steps = [];
    json.steps = json.steps.map((s, i) => ({
      key: s.key ?? `step_${i}`,
      label: s.label ?? "处理中",
      status: s.status ?? "pending",
      skill: s.skill,
      command: s.command,
    }));
    json.requires_user_confirm = Boolean(json.requires_user_confirm);
    return json;
  } catch {
    return null;
  }
}

function rowToConfig(row: {
  api_base_url: string | null;
  api_key_encrypted: string | null;
  model_name: string | null;
}): SlotConfig | null {
  if (!row.api_base_url || !row.api_key_encrypted) return null;
  return {
    api_base_url: row.api_base_url,
    api_key: row.api_key_encrypted,
    model_name: row.model_name ?? "mimo-v2.5",
    provider: /anthropic|xiaomimimo/i.test(row.api_base_url) ? "mimo" : "deepseek",
  };
}

/** LLM Planner with rule-based fallback (PRD §0.12.4). */
export async function runPlanner(input: {
  scene: SceneId;
  userMessage: string;
  history: MessageRow[];
}): Promise<ExecutionPlan> {
  const text = input.userMessage.trim();
  if (!text) {
    return runPlannerRules(input);
  }

  const rulesPlan = runPlannerRules(input);
  if (!isAmbiguousRulesPlan(rulesPlan)) {
    return rulesPlan;
  }

  const reasoning = await ensureModelSlot("reasoning");
  if (!reasoning) {
    return runPlannerRules(input);
  }

  const cfg = rowToConfig(reasoning);
  if (!cfg) return runPlannerRules(input);

  const skillIndex = loadSkillIndex(input.scene);

  // D3: 细粒度 intent 分类的 LLM prompt
  const system = `你是金融顾问 Agent 的 Planner。仅输出 JSON，不要 markdown。
场景 Tab：${input.scene}
可用 Skill：
${skillIndex || "（无）"}

intent 规则：
- simple_qa：概念解释、闲聊、单点事实、任意 Tab 的短问（如"什么是最大回撤？"）
- scene_task：当前 Tab 正式业务流程
  · profile: 梳理投资需求、生成投资需求报告、重新开始
  · plan: 生成资产配置方案、校准方案、调整方案
  · portfolio: 录入持仓、更新持仓、重新分析、对照方案偏离分析
  · fund: 完整基金解读报告、基金自选管理、基金问答
- cross_scene_handoff：用户需要别的 Tab 能力，须先问再跳转
- chat Tab 无 scene_task 写路径；写业务须 cross_scene_handoff
- 每条用户消息都可能涉及多个意图，请选择最匹配的一个

示例：
- "什么是再平衡？" → simple_qa（任意 Tab）
- "帮我梳理投资需求" → scene_task（profile）
- "生成养老的资产配置方案" → scene_task（plan）
- "更新我的持仓" → scene_task（portfolio）
- "出具 019305 完整解读报告" → scene_task（fund）
- "我想先补需求梳理"（在 chat Tab）→ cross_scene_handoff → profile
- "管理费多少" → simple_qa（fund Tab）或 scene_task（fund Tab 含基金问答步骤）

输出 schema：
{"intent":"simple_qa|scene_task|cross_scene_handoff","target_scene":"chat|profile|plan|portfolio|fund|null","steps":[{"key":"...","label":"...","skill":"..."}],"requires_user_confirm":boolean,"reasoning_summary":"一句中文"}`;

  try {
    const content = await completeText(cfg, {
      system,
      messages: [
        ...input.history.slice(-6).map((m) => ({
          role: m.role,
          content: m.content ?? "",
        })),
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 512,
    });

    const plan = parsePlanJson(content);
    if (plan) {
      if (plan.intent === "scene_task" && input.scene === "chat") {
        return runPlannerRules(input);
      }
      return plan;
    }
  } catch {
    // fallback
  }

  return runPlannerRules(input);
}
