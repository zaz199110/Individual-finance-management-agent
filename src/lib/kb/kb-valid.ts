/** KB-03-VALID-01 · EMB-FILTER-01 — encoding constants (PRD §9.2.0g) */

// L1: 披露文件块 — 不做 embedding 筛选，直接提供最相关的 block
export const L1_RECALL = 20;
export const L1_TOP_K = 12;  // 从 5 提升到 12，确保报告有足够数据源
export const L1_EMB_THRESHOLD = 0.35;
export const L1_KEYWORD_THRESHOLD = 2;

// L2: 语义 FAQ — 扩充到 100 条，调整 TOP_K
export const L2_RECALL = 30;  // 从 10 提升到 30，扩大召回范围
export const L2_TOP_K_WITH_EMB = 10;   // 有 embedding 时提供 10 条
export const L2_TOP_K_WITHOUT_EMB = 20; // 无 embedding 时提供 20 条
export const L2_TOP_K = 10;  // 默认值，保持向后兼容
export const L2_EMB_THRESHOLD = 0; // 2026-06-24: 降至0，embedding仅排序不过滤（eval报告结论）
export const L2_KEYWORD_THRESHOLD = 3;

// L3: 联网搜索 — 调整 TOP_K
export const L3_RECALL = 15;  // 从 8 提升到 15
export const L3_TOP_K_WITH_EMB = 10;   // 有 embedding 时提供 10 条
export const L3_TOP_K_WITHOUT_EMB = 20; // 无 embedding 时提供 20 条
export const L3_TOP_K = 10;  // 默认值，保持向后兼容
export const L3_EMB_THRESHOLD = 0.3;

export function isL1Valid(lowConfidence: boolean, chunkId?: string): boolean {
  return !lowConfidence && Boolean(chunkId);
}

export function isL2Valid(lowConfidence: boolean): boolean {
  return !lowConfidence;
}

export function isL3Valid(citationCount: number, lowConfidence: boolean): boolean {
  return citationCount > 0 && !lowConfidence;
}
