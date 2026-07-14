import fs from "node:fs";
import { getDraftMetaPathForReport } from "@/lib/reports/draft-path";
import { readDraftMeta } from "@/lib/reports/draft-meta";

const INTERNAL_TERMS =
  /\b(L0|L1|L2|L3|KB-03|chunk_id|RAG|pgvector|explore)\b|Archetype/i;

/** 必含章节 */
const REQUIRED_CHAPTERS = [
  "持仓明细",
  "收益概况",
  "结构分布",
  "基金解读",
  "风险",
  "免责",
];

export interface PortfolioReportVerifyResult {
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

export function verifyPortfolioReportDraft(input: {
  draftPath: string;
  holdingsVersionId?: string;
}): PortfolioReportVerifyResult {
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

  // 图表检查（≥2 图）
  const echarts_count = countEchartsBlocks(md);
  const minCharts = 2;
  if (echarts_count < minCharts) {
    errors.push(
      `ECharts 围栏不足 ${minCharts} 块（当前 ${echarts_count}）。`,
    );
  }
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

  // 章节检查（共用）
  for (const chapter of REQUIRED_CHAPTERS) {
    if (!md.includes(chapter)) {
      errors.push(`缺少必含章节「${chapter}」。`);
    }
  }

  // PORT-HOLDINGS-IN-REPORT-01: §一 持仓明细必须存在
  if (!/§一|## .*持仓明细/.test(md)) {
    errors.push("缺少「§一 持仓明细」（PORT-HOLDINGS-IN-REPORT-01）。");
  }

  // 格式检查
  if (!/温馨提示/.test(md)) {
    errors.push("缺少温馨提示（合规短版）。");
  }
  if (!/数据截至/.test(md)) {
    errors.push("文首须含数据截至说明。");
  }

  errors.push(...invalidEchartsJson(md));

  // draft-meta 检查
  if (!has_draft_meta) {
    errors.push("缺少 draft-meta.json（须含 report_type 等）。");
  } else {
    if (meta!.report_type !== "portfolio") {
      errors.push("draft-meta.json 中 report_type 须为 portfolio。");
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
