import fs from "node:fs";
import { exploreFundKnowledgeAsync } from "@/harness/infra/fund_knowledge/explore";
import { webSearch } from "@/harness/tools/web_search";
import { completeText } from "@/lib/llm/invoke";
import {
  applyFundSynopsisToMarkdown,
  buildTplFundSynopsis,
  generateFundSynopsisWithLlm,
  stripFundSynopsisMarkers,
  type FundSynopsisInput,
} from "@/lib/fund/fund-report-synopsis";
import { isWebPortalJunk } from "@/lib/kb/disclosure-parse";
import { polishReportMarkdown } from "@/lib/reports/report-polish";
import { ensureModelSlot } from "@/lib/supabase/server";

function hasInlineScopeBullets(text: string): boolean {
  return /[：:]\s*-\s+\S/.test(text) || /\*\*投资限制[：:]\*\*\s*-\s+/.test(text);
}

const REFINABLE_SECTIONS = new Set([
  "投资范围",
  "费率结构",
  "风险揭示摘要",
  "投向与重仓",
]);

const REVIEW_SYSTEM = `你是基金解读报告的对客质检编辑（仅基金解析场景）。
**只审视** 来自知识库摘录、联网摘要或模型不确定的披露小节（投资范围 / 费率结构 / 风险揭示 / 投向与重仓中的非 L0 持仓表）。
**不要改写**：产品身份表、L0 业绩数字、echarts 代码块、阅读指引、引用说明表——这些是 L0 或模板直出。

检查待审小节是否有：
1. 门户网站导航垃圾（新浪、天天基金列表、流水号、基金一览）
2. 与产品类型明显不符（如同业存单基金写大量股票配置）
3. 过长难读的披露原文粘贴（应改为 3 条以内要点列表）
4. 重复、矛盾或与产品类型描述冲突
5. **内部实现信息**（Tushare、AKShare、演示注册表、registry_demo、L0/L1 等）——对客正文 **一律不得出现**

只输出 JSON（不要 markdown 围栏）：
{
  "needs_fix": boolean,
  "sections": [
    {
      "title": "投资范围",
      "issues": ["问题简述"],
      "kb_query": "用于检索本地基金知识库的短查询",
      "web_query": "可选，KB 不足时的联网查询"
    }
  ]
}
若无问题：{"needs_fix":false,"sections":[]}`;

const REWRITE_SYSTEM = `你是基金解读报告编辑。根据「证据材料」重写指定 ### 小节正文。
规则：
- 对客友好，3 条以内 bullet 或短表；禁止 L0/L1/chunk/Tushare/AKShare/演示注册表/registry 等内部词
- 数字仅来自证据；无证据则写「以最新产品资料概要为准」不写具体%
- 保留 footnote [^n] 若原文有且仍适用
- 若原稿以「本段数据截止 **YYYY-MM-DD**」开头，**须保留该行**（知识库来源说明）
- 不要输出 ### 标题本身，只输出小节正文
- 不要修改 echarts 代码块
- **不得破坏 Markdown 表格**：多行 | 表格须保持每行一条记录
- **不得**向 C 端用户解释数据来源链路或配置 Token`;

interface ReviewPlan {
  needs_fix: boolean;
  sections: Array<{
    title: string;
    issues: string[];
    kb_query?: string;
    web_query?: string;
  }>;
}

export interface FundDraftRefineResult {
  ok: boolean;
  refined: boolean;
  skipped?: boolean;
  skip_reason?: string;
  sections_fixed?: string[];
  error?: string;
}

function extractSection(md: string, title: string): { body: string; start: number; end: number } | null {
  const lines = md.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `### ${title}`) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^#{2,3} /.test(line) || line.trim() === "---") {
      end = i;
      break;
    }
  }

  return {
    body: lines.slice(start, end).join("\n").trim(),
    start,
    end,
  };
}

function replaceSection(md: string, title: string, newBody: string): string {
  const hit = extractSection(md, title);
  if (!hit) return md;
  const lines = md.split("\n");
  const before = lines.slice(0, hit.start);
  const after = lines.slice(hit.end);
  const bodyLines = newBody.trim() ? ["", newBody.trim(), ""] : [""];
  return [...before, ...bodyLines, ...after].join("\n");
}

function parseReviewJson(text: string): ReviewPlan | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  try {
    const parsed = JSON.parse(raw) as ReviewPlan;
    if (typeof parsed.needs_fix !== "boolean") return null;
    if (!Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sectionLooksBad(title: string, body: string): boolean {
  if (!body.trim()) return true;
  if (isWebPortalJunk(body)) return true;
  if (title === "投资范围" && body.length > 420 && !/^-\s+\*\*投资/.test(body)) {
    return true;
  }
  if (title === "投资范围" && hasInlineScopeBullets(body)) {
    return true;
  }
  if (title === "投向与重仓" && /\*[^*]+\*\s*\|/.test(body)) {
    return true;
  }
  return false;
}

/** L0 结构化前十持仓表 · 不经 LLM 审视 */
export function isL0StructuredHoldingsBody(body: string): boolean {
  return /\| 序号 \|.*重仓/.test(body) && /\| 1 \|/.test(body);
}

/** 知识库摘录前的数据截止说明 */
export function isVaultSourcedExcerptBody(body: string): boolean {
  return /本段数据截止 \*\*\d{4}-\d{2}-\d{2}\*\*/.test(body);
}

/** 是否纳入 compose 审视（L1/联网/LLM 不确定内容；L0 直出跳过） */
export function shouldConsiderRefine(title: string, body: string): boolean {
  if (!REFINABLE_SECTIONS.has(title)) return false;
  if (title === "投向与重仓" && isL0StructuredHoldingsBody(body)) {
    return sectionLooksBad(title, body);
  }
  if (isVaultSourcedExcerptBody(body)) {
    return true;
  }
  if (/公开检索|联网检索/.test(body)) return true;
  return sectionLooksBad(title, body);
}

function buildDisclosureReviewPreview(md: string): string {
  const parts: string[] = [];
  for (const title of REFINABLE_SECTIONS) {
    const sec = extractSection(md, title);
    if (!sec || !shouldConsiderRefine(title, sec.body)) continue;
    parts.push(`### ${title}\n${sec.body.slice(0, 900)}`);
  }
  return parts.join("\n\n---\n\n");
}

async function gatherSectionEvidence(input: {
  fundCode: string;
  title: string;
  kbQuery: string;
  webQuery?: string;
  hasVault: boolean;
}): Promise<string> {
  const parts: string[] = [];

  if (input.hasVault && input.kbQuery.trim()) {
    const ex = await exploreFundKnowledgeAsync({
      fund_code: input.fundCode,
      query: input.kbQuery,
      max_hits: 4,
    });
    for (const hit of ex.hits.slice(0, 3)) {
      parts.push(`【知识库 · ${hit.heading}】\n${hit.excerpt.slice(0, 800)}`);
    }
  }

  if (parts.length < 2 && input.webQuery?.trim()) {
    const ws = await webSearch({ query: input.webQuery, max_results: 3 });
    if (ws.summary && !isWebPortalJunk(ws.summary)) {
      parts.push(`【联网摘要】\n${ws.summary.slice(0, 600)}`);
    }
    for (const sn of (ws.snippets ?? []).slice(0, 2)) {
      if (!isWebPortalJunk(sn)) parts.push(`【联网片段】\n${sn.slice(0, 400)}`);
    }
  }

  return parts.join("\n\n").slice(0, 2400);
}

async function rewriteSection(input: {
  cfg: import("@/lib/config/model-providers").SlotConfig;
  fundCode: string;
  fundName: string;
  fundType: string;
  title: string;
  issues: string[];
  original: string;
  evidence: string;
}): Promise<string | null> {
  const user = [
    `基金：${input.fundCode} ${input.fundName}（${input.fundType}）`,
    `小节：### ${input.title}`,
    `问题：${input.issues.join("；")}`,
    "",
    "【原稿】",
    input.original.slice(0, 1200),
    "",
    "【证据材料】",
    input.evidence || "（无额外证据，请基于原稿压缩为对客要点，删除门户垃圾）",
  ].join("\n");

  const out = await completeText(input.cfg, {
    system: REWRITE_SYSTEM,
    messages: [{ role: "user", content: user }],
    max_tokens: 900,
    temperature: 0.2,
  });

  const trimmed = out.trim();
  if (!trimmed || trimmed.includes("```echarts")) return null;
  return trimmed;
}

async function applyFundSynopsisRefine(
  draftPath: string,
  synopsisInput: FundSynopsisInput,
): Promise<boolean> {
  let blocks = buildTplFundSynopsis(synopsisInput);
  if (process.env.HARNESS_SKIP_LLM_REVIEW !== "1") {
    const reasoning = await ensureModelSlot("reasoning");
    if (reasoning) {
      try {
        const llm = await generateFundSynopsisWithLlm(
          {
            api_base_url: reasoning.api_base_url,
            api_key: reasoning.api_key_encrypted,
            model_name: reasoning.model_name ?? "mimo-v2.5",
            provider: "mimo",
          },
          synopsisInput,
          completeText,
        );
        if (llm) blocks = llm;
      } catch {
        /* TPL fallback */
      }
    }
  }
  let md = fs.readFileSync(draftPath, "utf8");
  md = applyFundSynopsisToMarkdown(md, blocks);
  fs.writeFileSync(draftPath, md, "utf8");
  return true;
}

/** 基金报告草稿：推理模型质检 → 知识库 → 联网 → 重写问题小节（全类型通用） */
export async function reviewAndRefineFundDraft(input: {
  draftPath: string;
  fundCode: string;
  fundName: string;
  fundType: string;
  hasVault: boolean;
  holdingsSource?: "live" | "registry_demo";
  synopsisInput?: FundSynopsisInput;
}): Promise<FundDraftRefineResult> {
  if (!fs.existsSync(input.draftPath)) {
    return { ok: false, refined: false, error: "草稿不存在。" };
  }

  let synopsisRefined = false;
  if (input.synopsisInput) {
    synopsisRefined = await applyFundSynopsisRefine(input.draftPath, input.synopsisInput);
  }

  if (process.env.HARNESS_SKIP_LLM_REVIEW === "1") {
    let md = fs.readFileSync(input.draftPath, "utf8");
    md = stripFundSynopsisMarkers(md);
    fs.writeFileSync(input.draftPath, polishReportMarkdown(md), "utf8");
    return {
      ok: true,
      refined: synopsisRefined,
      skipped: !synopsisRefined,
      skip_reason: synopsisRefined ? undefined : "HARNESS_SKIP_LLM_REVIEW",
    };
  }

  let md = fs.readFileSync(input.draftPath, "utf8");
  if (input.holdingsSource === "registry_demo") {
    md = stripInternalDataSourceNotes(md);
  }

  const reasoning = await ensureModelSlot("reasoning");
  if (!reasoning) {
    const ruleFix = applyRuleBasedSectionFixes(md);
    if (ruleFix.changed) {
      fs.writeFileSync(input.draftPath, polishReportMarkdown(ruleFix.md), "utf8");
      return { ok: true, refined: true, sections_fixed: ruleFix.sections };
    }
    return { ok: true, refined: false, skipped: true, skip_reason: "reasoning_unavailable" };
  }

  const cfg = {
    api_base_url: reasoning.api_base_url,
    api_key: reasoning.api_key_encrypted,
    model_name: reasoning.model_name ?? "mimo-v2.5",
    provider: "mimo" as const,
  };

  const disclosurePreview = buildDisclosureReviewPreview(md);
  const preview =
    disclosurePreview ||
    (md.length > 12000 ? md.slice(0, 12000) + "\n\n…（下文略）" : md);
  let plan: ReviewPlan | null = null;

  if (disclosurePreview && reasoning?.api_base_url) {
    try {
      const reviewOut = await completeText(cfg, {
        system: REVIEW_SYSTEM,
        messages: [
          {
            role: "user",
            content: `基金代码 ${input.fundCode} · ${input.fundName} · ${input.fundType}\n\n【待审视披露小节】\n${preview}`,
          },
        ],
        max_tokens: 700,
        temperature: 0.1,
      });
      plan = parseReviewJson(reviewOut);
    } catch {
      plan = null;
    }
  }

  const sectionsToFix = new Set<string>();
  if (plan?.needs_fix) {
    for (const s of plan.sections) {
      if (REFINABLE_SECTIONS.has(s.title)) sectionsToFix.add(s.title);
    }
  }

  for (const title of REFINABLE_SECTIONS) {
    const sec = extractSection(md, title);
    if (sec && shouldConsiderRefine(title, sec.body)) {
      sectionsToFix.add(title);
    }
  }

  if (!sectionsToFix.size) {
    md = stripFundSynopsisMarkers(md);
    fs.writeFileSync(input.draftPath, polishReportMarkdown(md), "utf8");
    return { ok: true, refined: synopsisRefined };
  }

  const fixed: string[] = [];
  for (const title of sectionsToFix) {
    const sec = extractSection(md, title);
    if (!sec) continue;

    const planSec = plan?.sections.find((s) => s.title === title);
    const kbQuery =
      planSec?.kb_query?.trim() ||
      `${input.fundName} ${input.fundCode} ${title === "投资范围" ? "投资范围 产品资料概要" : title}`;
    const webQuery =
      planSec?.web_query?.trim() ||
      `${input.fundName} ${input.fundCode} ${title}`;

    const evidence = await gatherSectionEvidence({
      fundCode: input.fundCode,
      title,
      kbQuery,
      webQuery,
      hasVault: input.hasVault,
    });

    try {
      const rewritten = await rewriteSection({
        cfg,
        fundCode: input.fundCode,
        fundName: input.fundName,
        fundType: input.fundType,
        title,
        issues: planSec?.issues ?? ["表述冗长或含非对客内容"],
        original: sec.body,
        evidence,
      });
      if (rewritten && rewritten !== sec.body.trim()) {
        md = replaceSection(md, title, rewritten);
        fixed.push(title);
      }
    } catch {
      /* 单节失败不阻断 */
    }
  }

  if (input.holdingsSource === "registry_demo") {
    md = stripInternalDataSourceNotes(md);
  }

  md = stripFundSynopsisMarkers(md);

  if (fixed.length) {
    fs.writeFileSync(input.draftPath, polishReportMarkdown(md), "utf8");
    return { ok: true, refined: true, sections_fixed: fixed };
  }

  const ruleFix = applyRuleBasedSectionFixes(md);
  if (ruleFix.changed) {
    fs.writeFileSync(
      input.draftPath,
      polishReportMarkdown(stripFundSynopsisMarkers(ruleFix.md)),
      "utf8",
    );
    return { ok: true, refined: true, sections_fixed: ruleFix.sections };
  }

  fs.writeFileSync(input.draftPath, polishReportMarkdown(md), "utf8");
  return { ok: true, refined: synopsisRefined };
}

function applyRuleBasedSectionFixes(md: string): {
  changed: boolean;
  md: string;
  sections: string[];
} {
  let next = md;
  const sections: string[] = [];
  for (const title of REFINABLE_SECTIONS) {
    const sec = extractSection(next, title);
    if (sec && shouldConsiderRefine(title, sec.body)) {
      sections.push(title);
    }
  }
  if (!sections.length) return { changed: false, md: next, sections: [] };
  next = polishReportMarkdown(next);
  return { changed: next !== md, md: next, sections };
}

/** 移除历史版本可能写入的对客内部数据说明 */
function stripInternalDataSourceNotes(md: string): string {
  return md
    .replace(
      />\s*\*\*数据说明：\*\*[^\n]*(?:演示注册表|Tushare|AKShare|registry)[^\n]*/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

export async function refineFundDraftFile(input: {
  draftPath: string;
  fundCode: string;
  fundName: string;
  fundType: string;
  hasVault: boolean;
  holdingsSource?: "live" | "registry_demo";
}): Promise<boolean> {
  const r = await reviewAndRefineFundDraft(input);
  return r.refined;
}
