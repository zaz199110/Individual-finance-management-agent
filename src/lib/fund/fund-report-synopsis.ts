import {
  buildBenchmarkSummarySentence,
  formatAsOfTradeDateLabel,
} from "@/lib/fund/report-blueprint";
import type { FundLookupResult } from "@/lib/fund/lookup";

export const FUND_SYNOPSIS_MARKERS = {
  threeSentences: "<!-- FUND-THREE-SENTENCES -->",
  chapter2Intro: "<!-- FUND-CH2-INTRO -->",
  chapter3Intro: "<!-- FUND-CH3-INTRO -->",
  l0Summary: "<!-- FUND-L0-SUMMARY -->",
} as const;

export interface FundSynopsisInput {
  fundCode: string;
  fundName: string;
  fundType: string;
  riskLevel: string;
  archetype: string;
  asOfTradeDate?: string;
  return1yPct?: number;
  maxDrawdown1yPct?: number;
  benchmarkName?: string;
  benchmarkReturn1yPct?: number;
  excessReturn1yPct?: number;
  investmentObjectiveExcerpt?: string;
  riskExcerpt?: string;
}

export interface FundSynopsisBlocks {
  threeSentences: string;
  chapter2Intro: string;
  chapter3Intro: string;
}

const SYNOPSIS_LINE_MAX = 90;
const SYNOPSIS_TOTAL_MAX = 240;

/** 与 fund-report-llm-quality charCount 一致 */
export function synopsisCharCount(text: string): number {
  return text.replace(/\*\*/g, "").replace(/^>\s*/gm, "").replace(/\s+/g, "").length;
}

/** 压缩 L0 重复类型标签，如「股票型 · 股票型 · 股票型」→「股票型」 */
export function compactFundTypeLabel(fundType: string): string {
  const parts = fundType
    .split(/[·/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.includes(p)) unique.push(p);
  }
  if (unique.length === 0) return fundType.slice(0, 20);
  return unique.slice(0, 2).join("·");
}

/** 去掉招募说明书套话，保留投向描述 */
function normalizeObjectiveExcerpt(raw?: string): string {
  if (!raw) return "";
  let s = raw.replace(/\s+/g, " ").trim();
  // 剥离 markdown 标题标记，防止 "## 三、投资范围" 等混入产品定位
  s = s.replace(/^#{1,6}\s*[一二三四五六七八九十\d.、]*\s*/g, "");
  s = s
    .replace(/^本基金(是|为|属于)?\s*/, "")
    .replace(/(一只|一款)\s*由.*?管理.*?(有限公司|管理公司)?\s*(发行的\s*)?/, "")
    .replace(/证券投资基金/g, "")
    .replace(/^[,，\s]+/, "")
    .trim();
  return s.slice(0, 60);
}

function shortenBenchmarkName(name: string): string {
  return name.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "").trim().slice(0, 14);
}

function fitSynopsisQuoteLine(label: string, content: string, maxChars = SYNOPSIS_LINE_MAX): string {
  const body = content.replace(/\s+/g, " ").trim();
  let lineBody = `${label}${body}`;
  if (synopsisCharCount(lineBody) <= maxChars) return `> ${lineBody}`;

  let cut = body;
  while (cut.length > 6 && synopsisCharCount(`${label}${cut}…`) > maxChars) {
    cut = cut.slice(0, -1);
  }
  return `> ${label}${cut}…`;
}

export function buildTplThreeSentences(input: FundSynopsisInput): string {
  const typeLabel = compactFundTypeLabel(input.fundType);
  const objective = normalizeObjectiveExcerpt(input.investmentObjectiveExcerpt);

  // ① 产品定位：类型 + 投向（货币基金不显示投资范围）
  const isMoneyMarket = input.fundType.includes("货币型");
  const line1Body = isMoneyMarket
    ? `${typeLabel}基金，适合作为短期闲置资金管理工具。`
    : objective
      ? `${typeLabel}基金，${objective}`
      : `${typeLabel}基金，适合作为资产长期配置工具。`;

  // ② 风险画像：风险等级 + 类型特征风险
  const riskLevel = input.riskLevel;
  let riskTail: string;
  switch (input.archetype) {
    case "A":
      riskTail = "海外市场波动与汇率变化是主要风险来源，适合以长期视角配置。";
      break;
    case "B":
      riskTail = "收益相对稳定，净值偶有波动，建议关注最短持有期与申赎灵活性。";
      break;
    case "C":
      riskTail = "被动指数投资，跟踪误差是核心风险，适合看好指数长期表现的投资者。";
      break;
    case "E":
      riskTail = "以固收为底仓，有少量权益敞口；适合能接受净值小幅波动的投资者。";
      break;
    case "F":
      riskTail = "通过基金组合分散配置，风险取决于底层资产，适合委托专业组合管理的投资者。";
      break;
    default: // D 及未分类
      riskTail = "权益仓位较高，短期波动与回撤可能较大，需结合自身风险承受能力判断。";
      break;
  }
  const line2Body = `风险等级为${riskLevel}；${riskTail}`;

  // ③ 适配提示：持有期限 + 适合人群
  const fitMap: Record<string, string> = {
    A: "适合计划持有 3 年以上、能接受海外波动的投资者，作为全球资产配置的补充。",
    B: "适合短期闲置资金管理，注重流动性与收益稳定性，不宜与权益基金直接比收益。",
    C: "适合看好指数长期表现、计划持有 3 年以上的投资者，关注跟踪误差与申赎效率。",
    D: "适合能承受权益波动、计划持有 3 年以上的投资者；基金经理或策略变化时需重新评估。",
    E: "适合稳健型投资者，作为理财替代或固收增强配置；关注权益敞口与信用风险。",
    F: "适合计划委托专业组合管理的投资者，持续关注底层基金风格与经理变化。",
  };
  const line3Body =
    fitMap[input.archetype] ??
    "适合充分了解产品特征后，结合自身持有期限与风险承受能力综合判断。";

  const lines = [
    fitSynopsisQuoteLine("**① 产品定位：** ", line1Body),
    fitSynopsisQuoteLine("**② 风险画像：** ", line2Body),
    fitSynopsisQuoteLine("**③ 适配提示：** ", line3Body),
  ];

  // 若合计仍超 240 字，缩短第一句
  if (synopsisCharCount(lines.join("\n")) > SYNOPSIS_TOTAL_MAX) {
    const shorter = line1Body.replace(/\s+/g, " ").trim().slice(0, 30);
    lines[0] = fitSynopsisQuoteLine("**① 产品定位：** ", shorter);
  }

  return lines.join("\n");
}

export function buildTplFundSynopsis(input: FundSynopsisInput): FundSynopsisBlocks {
  const threeSentences = buildTplThreeSentences(input);

  const ret1y =
    input.return1yPct != null ? `${input.return1yPct.toFixed(2)}%` : "—";
  const maxDd =
    input.maxDrawdown1yPct != null
      ? `${input.maxDrawdown1yPct.toFixed(2)}%`
      : "—";
  const bench = buildBenchmarkSummarySentence({
    benchmarkName: input.benchmarkName,
    benchmarkReturn1yPct: input.benchmarkReturn1yPct,
    return1yPct: input.return1yPct,
    excessReturn1yPct: input.excessReturn1yPct,
  });

  const ch2Tail: Record<string, string> = {
    A: "海外权益与汇率波动并存，宜拉长观察周期。",
    B: "重在流动性与收益稳定性，不宜与权益基金直接比收益。",
    D: "主动管理超额不保证，需关注经理与风格稳定性。",
  };
  const ch2Body = `近一年收益约 **${ret1y}**，最大回撤约 **${maxDd}**。${bench ? ` ${bench}` : ""}${ch2Tail[input.archetype] ?? ""}以上不构成收益承诺，仅供参考。`;

  const ch3Lines: Record<string, string> = {
    A: `作为 ${input.fundType}，适合以 3 年以上维度配置海外 beta；需接受 QDII 额度与境外波动。`,
    B: "短久期流动性工具为主，请关注最短持有期与申赎规则。",
    D: "适合能承受权益波动的长期配置；经理或风格变化时需重新评估。",
  };
  const ch3Body =
    ch3Lines[input.archetype] ??
    `从产品类型 ${input.fundType} 出发，请先明确持有期限与可接受回撤，再判断是否纳入长期组合。`;

  return {
    threeSentences,
    chapter2Intro: ch2Body,
    chapter3Intro: ch3Body,
  };
}

export function synopsisInputFromLookup(
  lookup: FundLookupResult,
  extras?: { investmentObjectiveExcerpt?: string; riskExcerpt?: string },
): FundSynopsisInput {
  return {
    fundCode: lookup.fund_code ?? "",
    fundName: lookup.fund_name ?? lookup.fund_code ?? "",
    fundType: lookup.fund_type ?? "—",
    riskLevel: lookup.risk_level ?? "—",
    archetype: lookup.archetype ?? "D",
    asOfTradeDate: lookup.as_of_trade_date,
    return1yPct: lookup.return_1y_pct,
    maxDrawdown1yPct: lookup.max_drawdown_1y_pct,
    benchmarkName: lookup.benchmark_name,
    benchmarkReturn1yPct: lookup.benchmark_return_1y_pct,
    excessReturn1yPct: lookup.excess_return_1y_pct,
    investmentObjectiveExcerpt: extras?.investmentObjectiveExcerpt,
    riskExcerpt: extras?.riskExcerpt,
  };
}

function replaceAfterMarker(text: string, marker: string, content: string): string {
  const idx = text.indexOf(marker);
  if (idx < 0) return text;
  const after = idx + marker.length;
  const tail = text.slice(after);
  const next = tail.search(/\n<!-- FUND-|\n---\n|\n## /);
  const end = next < 0 ? text.length : after + next;
  return `${text.slice(0, after)}\n${content}\n${text.slice(end)}`;
}

export function applyFundSynopsisToMarkdown(
  md: string,
  blocks: FundSynopsisBlocks,
): string {
  let out = replaceAfterMarker(md, FUND_SYNOPSIS_MARKERS.threeSentences, blocks.threeSentences);
  out = replaceAfterMarker(out, FUND_SYNOPSIS_MARKERS.chapter2Intro, blocks.chapter2Intro);
  out = replaceAfterMarker(out, FUND_SYNOPSIS_MARKERS.chapter3Intro, blocks.chapter3Intro);
  return out;
}

export function stripFundSynopsisMarkers(md: string): string {
  return md.replace(/<!-- FUND-[A-Z0-9-]+ -->\n?/g, "");
}

/**
 * 用 LLM 将投资范围原文摘要为 ≤30 字的一句话，用于 ① 产品定位。
 * 失败时返回 null，调用方可 fallback 到 normalizeObjectiveExcerpt。
 */
export async function summarizeObjectiveWithLlm(
  cfg: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" },
  rawExcerpt: string,
  completeText: (
    c: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" },
    opts: { system: string; messages: { role: string; content: string }[]; max_tokens: number; temperature: number },
  ) => Promise<string>,
): Promise<string | null> {
  const system = `你是基金报告编辑。将用户提供的投资范围原文压缩为一句话摘要。
要求：
- ≤30 字（含标点）
- 保留基金类型（如"货币型""股票型"）和核心投向（如"货币市场工具""消费行业"）
- 不要加标号、前缀、markdown 格式
- 不要出现"本基金""投资于"等套话，直接说投向
- 只输出一句话，不要其他内容`;
  try {
    const out = await completeText(cfg, {
      system,
      messages: [{ role: "user", content: rawExcerpt }],
      max_tokens: 60,
      temperature: 0.2,
    });
    const clean = out.replace(/^["'""]|["'""]$/g, "").replace(/\s+/g, " ").trim();
    if (clean.length > 0 && clean.length <= 40) return clean;
    return null;
  } catch {
    return null;
  }
}

const SYNOPSIS_SYSTEM = `你是基金解读报告编辑。根据提供的结构化数据，输出 JSON（不要 markdown 围栏）：
{
  "three_sentences": "三句话 blockquote 三行，每行以 > 开头，须含 ①②③ 前缀",
  "chapter2_intro": "第二章开篇 1 段普通段落（不要用 blockquote），须含近一年收益与最大回撤数字（来自输入）及非承诺限定",
  "chapter3_intro": "第三章开篇 1 段普通段落，不写业绩百分比"
}
规则：对客「您」；每句 40～90 字；三句合计 ≤240 字；禁止 L0/L1/Tushare/AKShare/建议买入/「本章回答」；①产品定位写类型与投向；②风险画像写风险等级与波动特征；③适配提示写适合持有期限与人群。`;

export async function generateFundSynopsisWithLlm(
  cfg: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" },
  input: FundSynopsisInput,
  completeText: (
    c: { api_base_url: string; api_key: string; model_name: string; provider: "mimo" },
    opts: { system: string; messages: { role: string; content: string }[]; max_tokens: number; temperature: number },
  ) => Promise<string>,
): Promise<FundSynopsisBlocks | null> {
  const user = JSON.stringify(input, null, 2);
  const out = await completeText(cfg, {
    system: SYNOPSIS_SYSTEM,
    messages: [{ role: "user", content: user }],
    max_tokens: 900,
    temperature: 0.25,
  });
  const jsonStart = out.indexOf("{");
  const jsonEnd = out.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1)) as {
      three_sentences?: string;
      chapter2_intro?: string;
      chapter3_intro?: string;
    };
    if (!parsed.three_sentences || !parsed.chapter2_intro || !parsed.chapter3_intro) {
      return null;
    }
    return {
      threeSentences: parsed.three_sentences.trim(),
      chapter2Intro: parsed.chapter2_intro.trim(),
      chapter3Intro: parsed.chapter3_intro.trim(),
    };
  } catch {
    return null;
  }
}
