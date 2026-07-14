/** FK-18 #4 · 对客正文不得含 L0/L1/L2/L3、chunk_id、RAG 等内部术语 */

const INTERNAL_TERMS =
  /\b(L0|L1|L2|L3|KB-03|chunk_id|RAG|pgvector|explore|registry_demo|Tushare|AKShare)\b|Archetype|演示注册表|Tushare Token/i;

const AGENT_INSTRUCTION_RE =
  /[,，]?\s*(写报告须用[^。\n]*|写报告须[^。\n]*|Agent 须[^。\n]*|须 FK-CITE[^。\n]*|报告写[^。\n]*须引用 L1[^。\n]*|解读报告须[^。\n]*|不可凭 FAQ 写死|FAQ 不替代披露数字|FAQ 不提供具体历史数字[^。\n]*|联网新闻仅作 L3 补充|不可凭记忆断言[^。\n]*)[。]?/g;

const LAYER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bL0\b/g, "授权行情"],
  [/\bL1\b/g, "入库披露"],
  [/\bL2\b/g, "知识库"],
  [/\bL3\b/g, "公开联网检索"],
  [/\bKB-03\b/g, ""],
  [/\bchunk_id\b/gi, ""],
  [/\bRAG\b/g, ""],
  [/\bpgvector\b/gi, ""],
  [/\bfund_knowledge_explore\b/g, "基金披露检索"],
  [/\bFK-CITE\b/g, "原文引用"],
  [/\bArchetype\b/gi, "产品类型"],
  [/\bTushare\b/gi, ""],
  [/\bAKShare\b/gi, ""],
  [/\bregistry_demo\b/gi, ""],
  [/演示注册表补全/g, ""],
  [/配置 Tushare Token[^。]*。?/g, ""],
];

/** 将 Gather / L2 摘要等内部文本改写为可对客表述 */
export function sanitizeCustomerFacingText(text: string): string {
  if (!text.trim()) return text;

  let s = text.replace(AGENT_INSTRUCTION_RE, "。");
  for (const [re, rep] of LAYER_REPLACEMENTS) {
    s = s.replace(re, rep);
  }
  s = s.replace(/。{2,}/g, "。");
  s = s.replace(/，\s*。/g, "。");
  s = s.replace(/\s{2,}/g, " ");

  return s.trim();
}

export function containsInternalTerms(text: string): boolean {
  return INTERNAL_TERMS.test(text);
}
