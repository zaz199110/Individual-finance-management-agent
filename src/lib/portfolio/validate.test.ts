import { describe, expect, it } from "vitest";
import { loadSampleHoldingsInitial } from "@/lib/portfolio/samples";
import { formatHoldingsCardBody, validateHoldings } from "@/lib/portfolio/validate";

describe("validateHoldings", () => {
  it("accepts sample initial holdings", () => {
    const r = validateHoldings(loadSampleHoldingsInitial());
    expect(r.ok).toBe(true);
    expect(r.data?.positions).toHaveLength(4);
  });

  it("rejects empty positions", () => {
    const payload = loadSampleHoldingsInitial();
    payload.positions = [];
    const r = validateHoldings(payload);
    expect(r.ok).toBe(false);
  });

  it("formats card body", () => {
    const body = formatHoldingsCardBody(loadSampleHoldingsInitial());
    expect(body).toMatch(/4 笔/);
    expect(body).toMatch(/003547/);
  });

  it("rejects invalid fund code", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [{ fund_code: "12345", invested_at: "2024-06-01", paid_amount: 10000, shares: 8000 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("基金代码无效"))).toBe(true);
  });

  it("rejects invalid invested_at format", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [{ fund_code: "110020", invested_at: "2024/06/01", paid_amount: 10000, shares: 8000 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("买入时间格式无效"))).toBe(true);
  });

  it("rejects zero paid_amount", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [{ fund_code: "110020", invested_at: "2024-06-01", paid_amount: 0, shares: 8000 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("paid_amount 须 > 0"))).toBe(true);
  });

  it("rejects zero shares", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [{ fund_code: "110020", invested_at: "2024-06-01", paid_amount: 10000, shares: 0 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("shares 须 > 0"))).toBe(true);
  });

  it("allows same fund_code with different invested_at", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [
        { fund_code: "110020", invested_at: "2024-06-01", paid_amount: 10000, shares: 8000 },
        { fund_code: "110020", invested_at: "2025-01-15", paid_amount: 5000, shares: 4000 },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects duplicate fund_code:invested_at", () => {
    const r = validateHoldings({
      kind: "holdings",
      change_summary: { narrative: "测试", kind: "initial" },
      positions: [
        { fund_code: "110020", invested_at: "2024-06-01", paid_amount: 10000, shares: 8000 },
        { fund_code: "110020", invested_at: "2024-06-01", paid_amount: 5000, shares: 4000 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("重复持仓行"))).toBe(true);
  });

  it("formats card body with pipe-separated format (no markdown table)", () => {
    const body = formatHoldingsCardBody({
      kind: "holdings",
      change_summary: { narrative: "测试持仓", kind: "initial" },
      positions: [
        { fund_code: "110020", fund_name: "易方达沪深300", invested_at: "2024-06-01", paid_amount: 10000, shares: 8000 },
        { fund_code: "890017", fund_name: "长江货币管家货币", invested_at: "2024-06-01", paid_amount: 5000, shares: 5000 },
      ],
    });
    // 应该包含表头
    expect(body).toMatch(/基金名称 \| 基金代码 \| 买入时间 \| 买入金额 \| 持有份额/);
    // 不应该包含 markdown 表格分隔行
    expect(body).not.toMatch(/\|[-\s]+\|/);
    // 应该包含数据行（管道符分隔）
    expect(body).toMatch(/易方达沪深300 \| 110020 \| 2024-06-01 \| 10,000 \| 8,000/);
    expect(body).toMatch(/长江货币管家货币 \| 890017 \| 2024-06-01 \| 5,000 \| 5,000/);
  });
});
