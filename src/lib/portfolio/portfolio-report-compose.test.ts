import { describe, it, expect, vi } from "vitest";
import { composePortfolioReport, type ComposeParams } from "./portfolio-report-compose";
import { PLACEHOLDERS } from "./report-blueprint";
import type { PortfolioGatherResult } from "./holdings-nav-gather";

vi.mock("@/lib/llm/invoke", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/llm/invoke")>();
  return {
    ...mod,
    completeText: vi.fn(async () =>
      "LLM generated content for test — this is a longer string to satisfy the minimum length requirement.",
    ),
  };
});

function makeGatherResult(): PortfolioGatherResult {
  return {
    as_of_trade_date: "2026-06-13",
    positions: [
      {
        fund_code: "003547",
        fund_name: "鹏华丰享债券A",
        invested_at: "2025-08-12",
        fund_type: "债券型",
        paid_amount: 30000,
        shares: 28412.35,
        l0_ok: true,
        nav_latest: 1.1,
        market_value: 31280,
        pnl_abs: 1280,
        pnl_pct: 4.3,
        dividend_missing: false,
        portfolio_role: "稳健底仓（核心）",
      },
      {
        fund_code: "000509",
        fund_name: "广发钱袋子货币A",
        invested_at: "2025-08-12",
        fund_type: "货币型",
        paid_amount: 20000,
        shares: 20000,
        l0_ok: true,
        nav_latest: 1.018,
        market_value: 20360,
        pnl_abs: 360,
        pnl_pct: 1.8,
        dividend_missing: false,
        is_money_fund: true,
        portfolio_role: "流动性管理",
      },
    ],
    total_cost: 50000,
    total_market_value: 51640,
    total_pnl_abs: 1640,
    total_pnl_pct: 3.3,
    l0_degraded: [],
    dividendMissingFunds: [],
  };
}

describe("composePortfolioReport", () => {
  it("填充所有占位符", async () => {
    const gather = makeGatherResult();

    const markdown = `# 测试报告

${PLACEHOLDERS.CH2_INTRO}

${PLACEHOLDERS.CH3_INTRO}

${PLACEHOLDERS.CH4_FUND("003547")}

${PLACEHOLDERS.CH4_FUND("000509")}

${PLACEHOLDERS.CH5_SUPP}
`;

    const params: ComposeParams = {
      markdown,
      gather,
    };

    const result = await composePortfolioReport(params);

    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH2_INTRO);
    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH3_INTRO);
    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH4_FUND("003547"));
    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH4_FUND("000509"));
    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH5_SUPP);

    expect(result.unfilledPlaceholders).toHaveLength(0);
    expect(result.hasLlmFailure).toBe(false);
  });

  it("§四 分基段落包含角色定位与定性解读", async () => {
    const gather = makeGatherResult();

    const markdown = `${PLACEHOLDERS.CH4_FUND("003547")}`;

    const params: ComposeParams = {
      markdown,
      gather,
    };

    const result = await composePortfolioReport(params);

    expect(result.markdown).toContain("稳健底仓（核心）");
    expect(result.markdown).toContain("本期表现");
    expect(result.markdown).not.toContain("**+1,280 元**");
    expect(result.markdown).not.toContain("**+4.3%**");
    expect(result.markdown).not.toContain("**31,280 元**");
    expect(result.markdown).not.toContain("**持有收益：**");
    expect(result.markdown).not.toContain("**最新市值：**");
    expect(result.markdown).not.toContain("**持有份额：**");
    expect(result.markdown).not.toContain("**买入成本：**");
  });

  it("L0 降级时显示数据缺失", async () => {
    const gather: PortfolioGatherResult = {
      as_of_trade_date: "2026-06-13",
      positions: [
        {
          fund_code: "999999",
          fund_name: "测试基金",
          invested_at: "2025-01-01",
          paid_amount: 10000,
          shares: 10000,
          l0_ok: false,
        },
      ],
      total_cost: 10000,
      total_market_value: 0,
      total_pnl_abs: -10000,
      total_pnl_pct: -100,
      l0_degraded: ["999999"],
      dividendMissingFunds: [],
    };

    const markdown = `${PLACEHOLDERS.CH4_FUND("999999")}`;

    const params: ComposeParams = {
      markdown,
      gather,
    };

    const result = await composePortfolioReport(params);

    expect(result.markdown).toContain("**数据缺失：**");
    expect(result.markdown).toContain("暂无行情数据");
  });

  it("启用 LLM 时优先使用 LLM 输出", async () => {
    const gather = makeGatherResult();

    const markdown = `${PLACEHOLDERS.CH2_INTRO}`;

    const { completeText } = await import("@/lib/llm/invoke");

    const params: ComposeParams = {
      markdown,
      gather,
      enableLlm: true,
      cfg: {
        provider: "mimo",
        api_base_url: "https://token-plan-cn.xiaomimimo.com/anthropic",
        api_key: "test-key",
        model_name: "mimo-v2.5",
      },
    };

    const result = await composePortfolioReport(params);

    expect(completeText).toHaveBeenCalled();
    expect(result.markdown).toContain(
      "LLM generated content for test — this is a longer string to satisfy the minimum length requirement.",
    );
    expect(result.hasLlmFailure).toBe(false);
  });

  it("未匹配的占位符保留在 unfilledPlaceholders", async () => {
    const gather = makeGatherResult();

    const markdown = `<!-- UNKNOWN-PH -->

${PLACEHOLDERS.CH5_SUPP}
`;

    const params: ComposeParams = {
      markdown,
      gather,
    };

    const result = await composePortfolioReport(params);

    expect(result.filledPlaceholders).toContain(PLACEHOLDERS.CH5_SUPP);

    // 未知占位符保留在输出中
    expect(result.markdown).toContain("<!-- UNKNOWN-PH -->");
  });
});
