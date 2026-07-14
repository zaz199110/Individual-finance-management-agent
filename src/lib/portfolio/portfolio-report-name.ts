/** PORT-NAME-01 · 北京时间日期 YYYYMMDD */
export function formatPortfolioReportYmd(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 固定格式：`持仓分析报告-{ymd}` */
export function buildPortfolioReportName(params: {
  ymd?: string;
}): string {
  const ymd = params.ymd ?? formatPortfolioReportYmd();
  return `持仓分析报告-${ymd}`;
}
