import { describe, expect, it } from "vitest";
import {
  parseAssetAllocationFromText,
  parseAssetAllocationFromSnippets,
} from "@/lib/kb/disclosure-parse";

const SAMPLE_206007 = `
## 二、投资组合 — 资产组合

| 资产类别 | 占基金总资产比例 |
|----------|-----------------|
| 股票 | **88.50%** |
| 债券 | 6.20% |
| 银行存款及清算备付金 | 5.30% |
`;

const SAMPLE_518880 = `
## 二、投资组合 — 资产组合

| 资产类别 | 占基金总资产比例 |
|----------|-----------------|
| 目标 ETF（黄金） | **93.50%** |
| 债券 | 1.20% |
| 银行存款及清算备付金 | 5.30% |
`;

describe("parseAssetAllocationFromText", () => {
  it("parses equity hybrid quarterly table", () => {
    const alloc = parseAssetAllocationFromText(SAMPLE_206007);
    expect(alloc?.stock_pct).toBe(88.5);
    expect(alloc?.bond_pct).toBe(6.2);
    expect(alloc?.cash_pct).toBe(5.3);
  });

  it("maps gold ETF target into other_pct", () => {
    const alloc = parseAssetAllocationFromText(SAMPLE_518880);
    expect(alloc?.other_pct).toBe(93.5);
    expect(alloc?.bond_pct).toBe(1.2);
    expect(alloc?.cash_pct).toBe(5.3);
  });

  it("returns null for region-only QDII section", () => {
    const qdii = `
## 二、投资组合 — 地区分布
| 地区 | 占基金资产净值比例 |
| 美国 | **98.12%** |
`;
    expect(parseAssetAllocationFromText(qdii)).toBeNull();
  });

  it("picks best snippet from multiple", () => {
    const best = parseAssetAllocationFromSnippets(["无表格", SAMPLE_206007]);
    expect(best?.stock_pct).toBe(88.5);
  });
});
