import fs from "node:fs";
import { getDraftMetaPathForReport } from "@/lib/reports/draft-path";
import { readDraftMeta } from "@/lib/reports/draft-meta";

const INTERNAL_TERMS =
  /\b(L0|L1|L2|L3|KB-03|chunk_id|RAG|pgvector|explore)\b|Archetype/i;

const REQUIRED_CHAPTERS = [
  "个人信息",
  "投资场景需求",
  "大类资产配置",
  "配置基金",
  "分批建仓计划",
];

export interface PlanReportVerifyResult {
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

export function verifyPlanReportDraft(input: {
  draftPath: string;
  goalConstraintId?: string;
}): PlanReportVerifyResult {
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

  // 合规检查
  if (INTERNAL_TERMS.test(md)) {
    errors.push(
      "正文含内部术语（L0/L1/L2/L3、KB-03、chunk_id 等），须改写为对客表述。",
    );
  }
  if (/AI 分析/.test(md)) {
    errors.push("正文禁止出现「AI 分析」。");
  }
  if (/建议买入|强烈推荐/.test(md)) {
    errors.push("正文禁止「建议买入/卖出」「强烈推荐」。");
  }

  // 章节检查
  for (const chapter of REQUIRED_CHAPTERS) {
    if (!md.includes(chapter)) {
      errors.push(`缺少必含章节「${chapter}」。`);
    }
  }

  // 格式检查
  if (!/仅供参考.*不构成|系统.*整理.*仅供参考/.test(md)) {
    errors.push("文末须含系统整理 · 仅供参考免责。");
  }

  // 图表检查（规划书 ≥1 张）
  const echarts_count = countEchartsBlocks(md);
  if (echarts_count < 1) {
    errors.push(`ECharts 围栏不足 1 块（当前 ${echarts_count}）。`);
  }
  errors.push(...invalidEchartsJson(md));

  // draft-meta 检查
  if (!has_draft_meta) {
    errors.push("缺少 draft-meta.json（须含 report_type 等）。");
  } else {
    if (meta!.report_type !== "plan") {
      errors.push("draft-meta.json 中 report_type 须为 plan。");
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
