export interface WebSearchCitation {
  title: string;
  url: string;
}

export interface WebSearchResult {
  summary: string;
  citations: WebSearchCitation[];
  /** 原始检索摘要片段，供 L3 费率解析等结构化提取 */
  snippets?: string[];
  raw?: string;
  /** L3 · KB-03-VALID */
  l3_low_confidence?: boolean;
  used_embedding?: boolean;
}

export interface WebSearchInput {
  query: string;
  max_results?: number;
  /** 时间范围过滤；智谱 Search-Std 支持 oneDay / oneWeek / oneMonth / oneYear / noLimit */
  recency_filter?: "oneDay" | "oneWeek" | "oneMonth" | "oneYear" | "noLimit";
}
