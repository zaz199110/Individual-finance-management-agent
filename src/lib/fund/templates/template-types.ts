/**
 * 模板共享类型。
 * 所有产品类型模板均遵守此接口。
 */

/** 模板函数返回值 */
export interface FundReportMarkdownResult {
  markdown: string;
  chartCount: number;
}

/** 模板 deps 声明：供上层 builder 注入依赖 */
export interface TemplateDeps<P> {
  /** 生成 Chapter 2 规则化开头 — 若为 null 则由上层 LLM 生成 */
  synChapter2?: ((params: P) => string) | null;
  /** 生成 Chapter 3 规则化开头 — 若为 null 则由上层 LLM 生成 */
  synChapter3?: ((params: P) => string) | null;
}
