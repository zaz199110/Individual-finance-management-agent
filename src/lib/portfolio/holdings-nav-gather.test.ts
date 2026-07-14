import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HoldingsPosition } from "./types";
import {
  computePortfolioRole,
  gatherHoldingsNavMetrics,
  sumCashDividendsForHolding,
} from "./holdings-nav-gather";
import type { PortfolioPositionMetrics } from "./holdings-nav-gather";

vi.mock("@/lib/l0/l0-sync", () => ({
  syncFundL0Local: vi.fn(),
}));

const sampleRows: HoldingsPosition[] = [
  {
    fund_code: "003547",
    fund_name: "鹏华丰享债券A",
    invested_at: "2025-08-12",
    paid_amount: 30000,
    shares: 28412.35,
  },
  {
    fund_code: "000509",
    fund_name: "广发钱袋子货币A",
    invested_at: "2025-08-12",
    paid_amount: 20000,
    shares: 20000,
  },
];

describe("sumCashDividendsForHolding", () => {
  it("sums dividends within holding period", () => {
    const { total, missing } = sumCashDividendsForHolding(
      [
        { ex_date: "2025-01-01", amount_per_share: 0.1 },
        { ex_date: "2025-09-01", amount_per_share: 0.05 },
        { ex_date: "2027-01-01", amount_per_share: 1 },
      ],
      "2025-08-12",
      "2026-06-13",
      1000,
    );
    expect(total).toBe(50);
    expect(missing).toBe(false);
  });
});

describe("gatherHoldingsNavMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("force syncs each unique fund and computes pnl", async () => {
    const { syncFundL0Local } = await import("@/lib/l0/l0-sync");
    vi.mocked(syncFundL0Local).mockImplementation(async (code) => {
      if (code === "003547") {
        return {
          ok: true,
          snapshot: {
            fund_code: "003547",
            fund_name: "鹏华丰享债券A",
            fund_type: "债券型",
            lookup_source: "tushare",
            metrics: { as_of_trade_date: "2026-06-13", nav: 1.1012 },
          },
        };
      }
      if (code === "000509") {
        return {
          ok: true,
          snapshot: {
            fund_code: "000509",
            fund_name: "广发钱袋子货币A",
            fund_type: "货币型",
            lookup_source: "tushare",
            metrics: {
              as_of_trade_date: "2026-06-13",
              nav: 1.0,
              money_fund_daily_income: [
                { date: "2025-01-01", income_per_10k: 0.5 },
                { date: "2025-09-01", income_per_10k: 0.5 },
                { date: "2025-12-01", income_per_10k: 0.5 },
                { date: "2026-03-01", income_per_10k: 0.5 },
                { date: "2026-06-13", income_per_10k: 0.5 },
                { date: "2026-07-01", income_per_10k: 0.5 },
              ],
            },
          },
        };
      }
      return { ok: false, error: "missing" };
    });

    const result = await gatherHoldingsNavMetrics(sampleRows, { force: true });

    expect(syncFundL0Local).toHaveBeenCalledTimes(2);
    expect(syncFundL0Local).toHaveBeenCalledWith("003547", { force: true });
    expect(result.as_of_trade_date).toBe("2026-06-13");
    expect(result.positions).toHaveLength(2);

    // 债券基金：常规 NAV-based P&L
    expect(result.positions[0]!.l0_ok).toBe(true);
    expect(result.positions[0]!.pnl_abs).toBeGreaterThan(0);

    // 货币基金：逐日累加实际收益
    const mmPos = result.positions[1]!;
    expect(mmPos.l0_ok).toBe(true);
    expect(mmPos.is_money_fund).toBe(true);
    // 4 in-range entries × 0.5 / 10000 × 20000 shares = 4.0
    expect(mmPos.pnl_abs).toBe(4);
    expect(mmPos.pnl_pct).toBe(0); // 4 / 20000 = 0.02% → rounded to 0

    expect(result.total_cost).toBe(50000);
  });

  it("marks row unavailable when sync fails", async () => {
    const { syncFundL0Local } = await import("@/lib/l0/l0-sync");
    vi.mocked(syncFundL0Local).mockResolvedValue({ ok: false, error: "no data" });

    const result = await gatherHoldingsNavMetrics([sampleRows[0]!], {
      force: true,
    });

    expect(result.positions[0]!.l0_ok).toBe(false);
    expect(result.l0_degraded).toContain("nav_missing:003547");
    expect(result.total_pnl_abs).toBe(0);
  });
});

describe("computePortfolioRole", () => {
  function makePos(partial: Partial<PortfolioPositionMetrics> & { fund_code: string; paid_amount: number }): PortfolioPositionMetrics {
    return {
      fund_code: partial.fund_code,
      fund_name: partial.fund_name,
      fund_type: partial.fund_type,
      paid_amount: partial.paid_amount,
      shares: partial.shares ?? 0,
      invested_at: partial.invested_at ?? "2025-01-01",
      l0_ok: partial.l0_ok ?? true,
      is_money_fund: partial.is_money_fund ?? false,
      pnl_pct: partial.pnl_pct ?? 0,
    };
  }

  it("货币基金 -> 流动性管理", () => {
    const pos = makePos({ fund_code: "000509", fund_name: "广发钱袋子货币A", fund_type: "货币型", paid_amount: 20000, is_money_fund: true });
    const role = computePortfolioRole(pos, [pos], 100000);
    expect(role).toBe("流动性管理");
  });

  it("债券型增强基金 -> 稳健增强（核心）", () => {
    const pos = makePos({ fund_code: "110017", fund_name: "易方达增强回报债券A", fund_type: "债券型", paid_amount: 50000 });
    const role = computePortfolioRole(pos, [pos], 138500);
    expect(role).toBe("稳健增强（核心）");
  });

  it("普通债券基金 -> 稳健底仓", () => {
    const bondA = makePos({ fund_code: "003547", fund_name: "鹏华丰享债券A", fund_type: "债券型", paid_amount: 30000 });
    const bondB = makePos({ fund_code: "110017", fund_name: "易方达增强回报债券A", fund_type: "债券型", paid_amount: 50000 });
    const role = computePortfolioRole(bondA, [bondA, bondB], 138500);
    expect(role).toBe("稳健底仓");
  });

  it("白酒行业指数基金 -> 行业主题配置（核心）", () => {
    const pos = makePos({ fund_code: "161725", fund_name: "招商中证白酒指数(LOF)A", fund_type: "指数型", paid_amount: 38500 });
    const role = computePortfolioRole(pos, [pos], 138500);
    expect(role).toBe("行业主题配置（核心）");
  });

  it("小仓位股票基金 -> 权益进攻（卫星）", () => {
    const pos = makePos({ fund_code: "000001", fund_name: "华夏成长混合", fund_type: "混合型", paid_amount: 5000 });
    const role = computePortfolioRole(pos, [pos], 100000);
    expect(role).toBe("权益进攻（卫星）");
  });

  it("QDII -> 海外分散", () => {
    const pos = makePos({ fund_code: "050028", fund_name: "博时标普500ETF联接(QDII)", fund_type: "QDII", paid_amount: 30000 });
    const role = computePortfolioRole(pos, [pos], 100000);
    expect(role).toBe("海外分散");
  });

  it("黄金基金 -> 另类配置", () => {
    const pos = makePos({ fund_code: "000217", fund_name: "华安黄金ETF联接", fund_type: "商品型", paid_amount: 10000 });
    const role = computePortfolioRole(pos, [pos], 100000);
    expect(role).toBe("另类配置");
  });
});
