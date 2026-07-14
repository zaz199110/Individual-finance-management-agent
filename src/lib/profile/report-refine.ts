import fs from "node:fs";
import { completeText } from "@/lib/llm/invoke";
import { buildModelProbeConfig } from "@/lib/settings/model-probe";
import { polishReportMarkdown } from "@/lib/reports/report-polish";
import { ensureModelSlot } from "@/lib/supabase/server";
import type { RelativeMetrics } from "./report-blueprint";
import {
  pickAcceptedLlmSection,
  validateProfileLlmSections,
} from "./report-llm-quality";

const UNDERSTANDING_SYSTEM = `你是投资需求报告的对客编辑。只润色「对您需求的理解」编号段落。
对客标准（须同时满足）：
- **格式清晰**：保留 **1. 2. 3.**（可选 **4.**）编号，每条一段
- **C 端友好**：解释「这组钱意味着什么」，不用顾问腔或术语
- **语言简洁**：每条 2～4 句，不做整表复读

硬性规则：
- 只做需求含义与约束自洽解读
- 禁止产品推荐、fund_code、大类比例、Tab/流程指引、市场观点
- 只输出编号段落，不要 ### 标题或 blockquote`;

const REVIEW_SYSTEM = `你是投资需求报告对客质检编辑。审视「对您需求的理解」是否满足：
1. 格式清晰（**1. 2. 3.** 编号）
2. C 端友好（无内部词、无 JSON 键、无 Tab 指引）
3. 语言简洁（每条≤4句）
4. 禁止 fund_code、大类比例、买卖建议

只输出 JSON（不要 markdown 围栏）：
{"needs_fix":boolean,"sections":[{"title":"对您需求的理解","issues":["问题简述"]}]}
若无问题：{"needs_fix":false,"sections":[]}`;

export interface ProfileDraftRefineResult {
  ok: boolean;
  refined: boolean;
  skipped?: boolean;
  skip_reason?: string;
  sections_fixed?: string[];
  quality_warnings?: string[];
  error?: string;
}

interface ReviewPlan {
  needs_fix: boolean;
  sections: Array<{ title: string; issues: string[] }>;
}

function extractBlockBetween(
  md: string,
  startRe: RegExp,
  endRe: RegExp,
): { body: string; start: number; end: number } | null {
  const startMatch = startRe.exec(md);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = md.slice(startIdx);
  const endMatch = endRe.exec(rest);
  const endIdx = endMatch ? startIdx + endMatch.index : md.length;
  return {
    body: md.slice(startIdx, endIdx).trim(),
    start: startIdx,
    end: endIdx,
  };
}

function replaceBlock(md: string, start: number, end: number, newBody: string): string {
  return (
    md.slice(0, start) +
    "\n" +
    newBody.trim() +
    "\n\n" +
    md.slice(end).replace(/^\n+/, "")
  );
}

function parseReviewJson(text: string): ReviewPlan | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  try {
    const parsed = JSON.parse(raw) as ReviewPlan;
    if (typeof parsed.needs_fix !== "boolean" || !Array.isArray(parsed.sections)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function polishSection(
  cfg: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" | "zhipu" | "deepseek" | "kimi" | "env" },
  system: string,
  original: string,
  context: string,
  issues?: string[],
): Promise<string | null> {
  const userParts = [`【规则草稿】`, original, "", `【上下文】`, context];
  if (issues?.length) {
    userParts.push("", `【须修正】`, issues.join("；"));
  }
  const out = await completeText(cfg, {
    system,
    messages: [{ role: "user", content: userParts.join("\n") }],
    max_tokens: 650,
    temperature: 0.22,
  });
  const trimmed = out.trim();
  if (!trimmed || trimmed.length < 40) return null;
  return trimmed;
}

async function reviewLlmSections(
  cfg: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" | "zhipu" | "deepseek" | "kimi" | "env" },
  understandingBody: string,
): Promise<ReviewPlan | null> {
  const preview = [
    "## 对您需求的理解（节选）",
    understandingBody.slice(0, 1200),
  ].join("\n");

  const out = await completeText(cfg, {
    system: REVIEW_SYSTEM,
    messages: [{ role: "user", content: preview }],
    max_tokens: 400,
    temperature: 0.1,
  });
  return parseReviewJson(out);
}

export async function refineProfileDraftReport(input: {
  draftPath: string;
  sceneName: string;
  relativeMetrics: RelativeMetrics;
  understandingDraft: string;
}): Promise<ProfileDraftRefineResult> {
  if (!fs.existsSync(input.draftPath)) {
    return { ok: false, refined: false, error: "草稿不存在。" };
  }

  if (process.env.HARNESS_SKIP_LLM_REVIEW === "1") {
    return { ok: true, refined: false, skipped: true, skip_reason: "HARNESS_SKIP_LLM_REVIEW" };
  }

  const reasoning = await ensureModelSlot("reasoning");
  if (!reasoning) {
    return { ok: true, refined: false, skipped: true, skip_reason: "reasoning_unavailable" };
  }

  const cfg = buildModelProbeConfig("reasoning", reasoning);
  if (!cfg) {
    return { ok: true, refined: false, skipped: true, skip_reason: "reasoning_unavailable" };
  }

  let md = fs.readFileSync(input.draftPath, "utf8");
  const fixed: string[] = [];
  const metricsJson = JSON.stringify(input.relativeMetrics, null, 2);
  const ctx = `场景：${input.sceneName}\n相对指标：\n${metricsJson}`;

  let understandingFinal = input.understandingDraft;

  try {
    const polishedUnderstanding = await polishSection(
      cfg,
      UNDERSTANDING_SYSTEM,
      input.understandingDraft,
      ctx,
    );
    understandingFinal = pickAcceptedLlmSection(
      polishedUnderstanding,
      input.understandingDraft,
    );
    if (polishedUnderstanding && understandingFinal === polishedUnderstanding) {
      fixed.push("对您需求的理解");
    }
  } catch {
    /* 保留规则稿 */
  }

  try {
    const plan = await reviewLlmSections(cfg, understandingFinal);
    if (plan?.needs_fix) {
      for (const sec of plan.sections) {
        const issues = sec.issues ?? [];
        if (!issues.length) continue;
        if (sec.title.includes("理解")) {
          const retry = await polishSection(
            cfg,
            UNDERSTANDING_SYSTEM,
            understandingFinal,
            ctx,
            issues,
          );
          understandingFinal = pickAcceptedLlmSection(
            retry,
            understandingFinal,
          );
          if (retry && understandingFinal === retry && !fixed.includes("对您需求的理解")) {
            fixed.push("对您需求的理解");
          }
        }
      }
    }
  } catch {
    /* 审视失败不阻断 */
  }

  const understandSec = extractBlockBetween(
    md,
    /^## 对您需求的理解\s*\n/m,
    /^---\s*\n\s*## 合规与说明/m,
  );
  if (understandSec) {
    const intro =
      "> 以下基于上文 **您已确认** 的信息归纳，说明 **需求含义与约束边界**；**不是** 产品推荐或买卖建议。\n\n" +
      understandingFinal;
    md = replaceBlock(md, understandSec.start, understandSec.end, intro);
  }

  let quality = validateProfileLlmSections(md);
  if (!quality.ok) {
    const u2 = extractBlockBetween(
      md,
      /^## 对您需求的理解\s*\n/m,
      /^---\s*\n\s*## 合规与说明/m,
    );
    if (u2) {
      const intro =
        "> 以下基于上文 **您已确认** 的信息归纳，说明 **需求含义与约束边界**；**不是** 产品推荐或买卖建议。\n\n" +
        input.understandingDraft;
      md = replaceBlock(md, u2.start, u2.end, intro);
    }
    quality = validateProfileLlmSections(md);
  }

  fs.writeFileSync(input.draftPath, polishReportMarkdown(md), "utf8");

  return {
    ok: quality.ok,
    refined: fixed.length > 0,
    sections_fixed: fixed.length ? fixed : undefined,
    quality_warnings: quality.warnings.length ? quality.warnings : undefined,
    error: quality.ok ? undefined : quality.errors.join("；"),
  };
}
