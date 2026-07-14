import fs from "node:fs";
import { readDraftMeta } from "@/lib/reports/draft-meta";
import { validateProfileLlmSections } from "@/lib/profile/report-llm-quality";

const INTERNAL_TERMS =
  /\b(L0|L1|L2|L3|KB-03|chunk_id|RAG|pgvector|explore|goal_detail|investment_constraints)\b|Archetype/i;

const INTRO_BLOCKS = ["1 基础信息"];

const BODY_H2_TITLES = [
  "1 基础信息",
  "2 投资场景",
  "3 AI建议",
  "4 合规提示",
];

const CONSTRAINT_LABELS = [
  "风险偏好",
  "最大回撤承受",
  "目标年化收益",
  "一次性投入",
  "每月投入",
];

export interface ProfileReportVerifyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  echarts_count: number;
  has_draft_meta: boolean;
}

function countEchartsBlocks(md: string): number {
  const matches = md.match(/```echarts[\s\S]*?```/g);
  return matches?.length ?? 0;
}

function invalidEchartsJson(md: string): string[] {
  const errors: string[] = [];
  const re = /```echarts\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    try {
      JSON.parse(m[1]!.trim());
    } catch {
      errors.push("存在无法 JSON.parse 的 echarts 围栏。");
      break;
    }
  }
  return errors;
}

function goalSectionMissingLabel(section: string, label: string): boolean {
  if (!section.includes(`**${label}**`)) return true;
  const line = section
    .split("\n")
    .find((l) => l.includes(`**${label}**`));
  if (!line) return true;
  const valuePart = line.split(/[：:]/).slice(1).join(":").trim();
  if (!valuePart || valuePart === "—" || valuePart === "—。") return true;
  return false;
}

function echartsMissingReadHint(md: string): string[] {
  const warnings: string[] = [];
  const re = /```echarts[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const before = md.slice(Math.max(0, m.index! - 200), m.index);
    if (!/下图|读图|怎么分|示意/.test(before)) {
      warnings.push("echarts 块前建议有 1 句读图指引。");
      break;
    }
  }
  return warnings;
}

export function verifyProfileReportDraft(input: {
  draftPath: string;
  goalConstraintId?: string;
}): ProfileReportVerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(input.draftPath)) {
    return {
      ok: false,
      errors: ["草稿文件不存在。"],
      warnings,
      echarts_count: 0,
      has_draft_meta: false,
    };
  }

  const md = fs.readFileSync(input.draftPath, "utf8");
  const meta = readDraftMeta(input.draftPath);
  const has_draft_meta = meta != null;

  if (INTERNAL_TERMS.test(md)) {
    errors.push(
      "正文含内部术语（L0/L1/L2/L3、goal_detail 等），须改写为对客表述。",
    );
  }
  if (/AI 分析/.test(md)) {
    errors.push("正文禁止出现「AI 分析」。");
  }
  if (/建议买入|建议卖出|强烈推荐/.test(md)) {
    errors.push("正文禁止「建议买入/卖出」「强烈推荐」。");
  }
  if (/\b\d{6}\b/.test(md)) {
    errors.push("正文禁止 fund_code（6 位数字代码）。");
  }
  if (/(?:股票|债券|货币).{0,8}\d+\s*%|大类.{0,6}\d+\s*%/.test(md)) {
    errors.push("正文禁止大类配置比例。");
  }

  for (const block of INTRO_BLOCKS) {
    if (!md.includes(block)) {
      errors.push(`缺少开篇块「${block}」。`);
    }
  }

  for (const title of BODY_H2_TITLES) {
    if (!md.includes(`## ${title}`)) {
      errors.push(`缺少正文章节「${title}」。`);
    }
  }

  // Basic info now uses a markdown table; verify core fields appear
  const coreBasicLabels = ["姓名", "年龄", "职业", "税后年收入"];
  for (const label of coreBasicLabels) {
    if (!md.includes(label)) {
      errors.push(`基础信息缺少「${label}」。`);
    }
  }

  for (const label of CONSTRAINT_LABELS) {
    if (!md.includes(label)) {
      errors.push(`投资场景表格缺少「${label}」。`);
    }
  }

  const goalType = (meta as { goal_type?: string } | null)?.goal_type;
  if (goalType) {
    const goalSection =
      md.match(/## 本组投资目标[\s\S]*?(?=^---\s*\n\s*## |\Z)/m)?.[0] ?? "";
    void goalSection;
  }

  if (!/合规提示/.test(md)) {
    errors.push("缺少「合规提示」章节。");
  }
  if (
    !/不构成投资建议/.test(md) &&
    !/仅供参考.*不构成/.test(md) &&
    !/AI.*生成.*仅供参考/.test(md)
  ) {
    errors.push("文末须含合规免责短句。");
  }

  const llmQuality = validateProfileLlmSections(md);
  errors.push(...llmQuality.errors);
  warnings.push(...llmQuality.warnings);

  const echarts_count = countEchartsBlocks(md);
  if (echarts_count > 2) {
    errors.push(`投资需求报告图表不得超过 2 张（当前 ${echarts_count}）。`);
  }
  errors.push(...invalidEchartsJson(md));
  warnings.push(...echartsMissingReadHint(md));

  if (!has_draft_meta) {
    errors.push("缺少 draft-meta.json（须含 report_type 等）。");
  } else {
    if (meta!.report_type !== "profile") {
      errors.push("draft-meta.json 中 report_type 须为 profile。");
    }
    if (!meta!.conversation_id || !meta!.run_id) {
      errors.push("draft-meta.json 缺少 conversation_id 或 run_id。");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    echarts_count,
    has_draft_meta,
  };
}
