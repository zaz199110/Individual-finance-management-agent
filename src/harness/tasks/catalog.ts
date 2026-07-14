import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getProjectRoot } from "@/lib/paths";
import type { SceneId } from "@/harness/registry/load";

export interface WorkflowTaskDef {
  task_key: string;
  label: string;
  parent_task_key?: string | null;
  node_depth: 1 | 2;
  sort_order: number;
  command?: string;
  status_default?: string;
}

type YamlTaskRow = {
  task_key: string;
  label: string;
  parent_task_key?: string;
  node_depth?: number;
  command?: string;
  status_default?: string;
};

type YamlCatalog = {
  scene: string;
  tasks: YamlTaskRow[];
};

const SCENE_CATALOG_FILES: Record<SceneId, string | null> = {
  chat: null,
  profile: "skills/profile/profile_workflow_tasks.zh.yaml",
  plan: "skills/plan/plan_workflow_tasks.zh.yaml",
  portfolio: "skills/portfolio/portfolio_workflow_tasks.zh.yaml",
  fund: "skills/fund/fund_workflow_tasks.zh.yaml",
};

/** Chat / planner 等不在 yaml 中的通用节点 */
const GENERIC_TASK_DEFS: WorkflowTaskDef[] = [
  {
    task_key: "planner",
    label: "理解对话",
    node_depth: 1,
    sort_order: 0,
  },
  {
    task_key: "vision_parse",
    label: "识别图片",
    node_depth: 1,
    sort_order: 3,
  },
  {
    task_key: "web_search",
    label: "检索公开资讯",
    node_depth: 1,
    sort_order: 5,
  },
  {
    task_key: "report_read",
    label: "读取已发布报告",
    node_depth: 1,
    sort_order: 6,
  },
  {
    task_key: "capability",
    label: "介绍能力",
    node_depth: 1,
    sort_order: 7,
  },
];

/**
 * 高频 task_key 中文 label 兜底映射
 * 当 YAML catalog 未加载或 scene 不匹配时，防止英文 task_key 泄露到进度条
 * 覆盖 4 个场景（profile/plan/portfolio/fund）共 40+ 个 task_key
 */
const FALLBACK_LABEL_MAP: Record<string, string> = {
  // profile 场景（简化为三大阶段 + 报告）
  "profile.basic.form": "填写基本情况",
  "profile.goal.form": "投资需求梳理",
  "profile.rpt.draft": "生成投资需求报告",
  // 以下为内部子步骤，保留 label 以防旧数据泄漏
  "profile.basic.verify": "审视基本情况",
  "profile.basic.wait": "等待确认基本情况",
  "profile.basic.save": "保存基本情况",
  "profile.goal.pick": "选择投资目标场景",
  "profile.goal.verify": "整理并审视本组投资需求",
  "profile.goal.wait": "等待确认本组需求",
  "profile.goal.save": "保存本组需求",
  "profile.rpt.draft.compose": "整理报告内容",
  "profile.rpt.draft.verify": "校验报告结构",
  "profile.rpt.wait": "等待确认发布报告",
  "profile.rpt.publish": "保存至我的报告",
  // plan 场景
  "plan.prep.check": "校验投资需求是否完善",
  "plan.s1.allocation.propose": "生成大类配置方案",
  "plan.s1.wait": "等待您确认大类配置",
  "plan.s2.detail.intent": "进行基金明细筛选",
  "plan.s2.detail.web": "进行基金明细筛选",
  "plan.s2.detail.screen": "进行基金明细筛选",
  "plan.s2.detail.verify": "校验基金数据完整性",
  "plan.s2.detail.review": "审视定稿基金明细方案",
  "plan.s2.wait": "等待您确认或继续讨论基金明细",
  "plan.rpt.draft": "撰写投资规划书",
  "plan.rpt.draft.gather": "汇总资产配置与备案信息",
  "plan.rpt.draft.compose": "撰写投资规划书正文",
  "plan.rpt.draft.charts": "生成配置图表与数据展示",
  "plan.rpt.draft.buyplan": "拟定分批建仓方案",
  "plan.rpt.draft.verify": "校验规划书完整性与合规性",
  "plan.rpt.wait": "等待您确认发布",
  // portfolio 场景
  "port.hold.input": "录入或更新持仓",
  "port.hold.parse": "整理您的持仓描述",
  "port.prep.read": "读取当前持仓",
  "port.rpt.gather.l0": "同步各持仓基金行情与分红",
  "port.rpt.draft.tpl": "整理持仓表与图表",
  "port.rpt.draft.compose": "撰写分析导语与要点",
  "port.rpt.draft.verify": "核对报告结构与图表",
  // fund 场景
  "fund.qa.understand": "理解您的问题",
  "fund.qa.answer": "检索并整理回答",
  "fund.prep.intent": "理解您的解读需求",
  "fund.prep.lookup": "确认基金档案与类型",
  "fund.prep.l0_sync": "同步行情、费率与持仓",
  "fund.prep.enrich.fetch": "检索公开资料",
  "fund.prep.enrich.index": "更新搜索索引",
  "fund.gather.l0": "拉取行情与持仓",
  "fund.gather.l1": "检索披露文件",
  "fund.gather.profile": "（进度占位）",
  "fund.rpt.draft.compose": "撰写基金解读报告",
  "fund.rpt.wait": "等待您确认发布",
  // 通用
  "msg-stopped": "已停止",
};

const catalogCache = new Map<SceneId | "generic", WorkflowTaskDef[]>();

function loadYamlCatalog(relativePath: string): WorkflowTaskDef[] {
  const filePath = path.join(getProjectRoot(), relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = yaml.load(raw) as YamlCatalog;
  return (doc.tasks ?? []).map((row, index) => ({
    task_key: row.task_key,
    label: row.label,
    parent_task_key: row.parent_task_key ?? null,
    node_depth: row.node_depth === 2 ? 2 : 1,
    sort_order: (index + 1) * 10,
    command: row.command,
    status_default: row.status_default,
  }));
}

function getCatalogForScene(scene: SceneId): WorkflowTaskDef[] {
  const cached = catalogCache.get(scene);
  if (cached) return cached;

  const rel = SCENE_CATALOG_FILES[scene];
  const defs = rel ? loadYamlCatalog(rel) : [];
  catalogCache.set(scene, defs);
  return defs;
}

function getGenericCatalog(): WorkflowTaskDef[] {
  const cached = catalogCache.get("generic");
  if (cached) return cached;
  catalogCache.set("generic", GENERIC_TASK_DEFS);
  return GENERIC_TASK_DEFS;
}

export function getWorkflowTaskDef(
  taskKey: string,
  scene?: SceneId,
): WorkflowTaskDef | null {
  const generic = getGenericCatalog().find((t) => t.task_key === taskKey);
  if (generic) return generic;

  if (scene) {
    const fromScene = getCatalogForScene(scene).find((t) => t.task_key === taskKey);
    if (fromScene) return fromScene;
  }

  for (const s of Object.keys(SCENE_CATALOG_FILES) as SceneId[]) {
    const hit = getCatalogForScene(s).find((t) => t.task_key === taskKey);
    if (hit) return hit;
  }
  return null;
}

export function listWorkflowTaskDefs(scene: SceneId): WorkflowTaskDef[] {
  return getCatalogForScene(scene);
}

export function resolveWorkflowTaskDef(
  input: {
    task_key: string;
    label?: string;
    parent_task_key?: string | null;
    node_depth?: 1 | 2;
    sort_order?: number;
  },
  scene?: SceneId,
): WorkflowTaskDef {
  const fromCatalog = getWorkflowTaskDef(input.task_key, scene);
  return {
    task_key: input.task_key,
    label: input.label ?? fromCatalog?.label ?? FALLBACK_LABEL_MAP[input.task_key] ?? input.task_key,
    parent_task_key:
      input.parent_task_key !== undefined
        ? input.parent_task_key
        : (fromCatalog?.parent_task_key ?? null),
    node_depth: input.node_depth ?? fromCatalog?.node_depth ?? 1,
    sort_order: input.sort_order ?? fromCatalog?.sort_order ?? 999,
  };
}
