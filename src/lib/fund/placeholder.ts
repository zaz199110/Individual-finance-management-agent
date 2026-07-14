export function buildFundPlaceholder(): {
  scene: "fund";
  title: string;
  empty_body: string;
  hint: string;
} {
  return {
    scene: "fund",
    title: "基金深度解读",
    empty_body: "输入代码或名称，直接提问即可。",
    hint: "例如：「019305 管理费多少」或「出具完整解读报告」。",
  };
}

/** 基金 Tab · 自选子页：输入框占位（不在此解读） */
export function buildFundWatchlistInputHint(): string {
  return "自选列表仅供浏览；要解读某只基金，请点上方「AI 解析」或直接输入代码提问。";
}

/** WL-03：自选「AI 解析」注入的用户消息 */
export function buildFundWatchlistAnalyzePrompt(fundCode: string): string {
  return `请就 ${fundCode} 出具完整基金解读报告`;
}
