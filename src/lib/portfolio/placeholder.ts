import type { portfolioRead } from "./read";

export interface PortfolioPlaceholder {
  scene: "portfolio";
  branch: "empty" | "has_holdings";
  title: string;
  empty_body: string;
  hint: string;
  position_count: number;
  confirmed_at: string | null;
}

export function buildPortfolioPlaceholder(
  read: Awaited<ReturnType<typeof portfolioRead>>,
): PortfolioPlaceholder {
  if (!read.has_current) {
    return {
      scene: "portfolio",
      branch: "empty",
      title: "录入持仓",
      empty_body: "直接打字，或点左下角 **+** 上传持仓截图。",
      hint: "想快速体验？可以说「用样例持仓」。",
      position_count: 0,
      confirmed_at: null,
    };
  }

  const dateLabel = read.confirmed_at
    ? new Date(read.confirmed_at).toISOString().slice(0, 10)
    : "—";

  return {
    scene: "portfolio",
    branch: "has_holdings",
    title: "继续分析您的持仓",
    empty_body:
      `最新一次持仓更新在 **${dateLabel}**，涉及 **${read.position_count}** 只基金。\n\n` +
      "可通过聊天修改您的持仓，或者直接进行 **「持仓分析」**。",
    hint: "可说「重新分析」，生成《持仓分析报告》。",
    position_count: read.position_count,
    confirmed_at: read.confirmed_at,
  };
}
