/**
 * 债券型基金模板 冒烟测试
 * 验证模板在各种参数组合下不会崩溃，并产生有效的 Markdown 输出。
 * 不依赖数据库、网络或 LLM。
 */
import { describe, it, expect } from "vitest";
import { buildBondFundReportMarkdown } from "./bond-fund.template";
import type { BondFundParams } from "./bond-fund.template";

const MINIMAL_PARAMS: BondFundParams = {
  fundCode: "217022",
  fundName: "招商产业债券A",
  fundType: "债券型",
  riskLevel: "中低风险",
  navDate: "2026-06-25",
  ymd: "2026-06-25",
  dateLabel: "2026年06月25日",
  scopeExcerpt: "本基金主要投资于债券资产，包括国债、金融债、企业债、公司债、中期票据、短期融资券等。",
  managerSection: "| 姓名 | 任职起始 | 任职结束 |\n|------|----------|----------|\n| 马龙 | 2015-04-13 | 至今 |",
  top5BondHoldingsSection: "",
  holderStructureSection: "",
  footnotesMarkdown: "",
  citeSection: "",
};

describe("buildBondFundReportMarkdown — smoke", () => {
  it("produces non-empty markdown with minimal params", () => {
    const result = buildBondFundReportMarkdown(MINIMAL_PARAMS);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(200);
    expect(result.chartCount).toBe(0);
  });

  it("includes all mandatory chapter headings", () => {
    const { markdown } = buildBondFundReportMarkdown({
      ...MINIMAL_PARAMS,
      citeSection: `## 引用说明

| 序号 | 文档名称 | 文档地址 |
|------|----------|----------|
| 1 | 基金产品资料概要 | [查看文档](http://example.com) |
`,
    });
    expect(markdown).toMatch(/产品介绍/);
    expect(markdown).toMatch(/基金经理/);
    expect(markdown).toMatch(/投资范围/);
    expect(markdown).toMatch(/费率结构/);
    expect(markdown).toMatch(/温馨提示/);
    expect(markdown).toMatch(/引用说明/);
  });

  it("renders all 13 Ch1 identity fields", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      management: "招商基金管理有限公司",
      custodian: "中国银行股份有限公司",
      foundDate: "2012-03-20",
      aumYi: 485.6,
      aumDate: "2026-03-31",
      minAmount: 0.01,
      expReturn: 4.5,
      return1yPct: 5.4,
      maxDrawdown1yPct: -0.85,
      benchmarkName: "中债综合指数",
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown).toContain("217022");
    expect(markdown).toContain("招商产业债券A");
    expect(markdown).toContain("债券型");
    expect(markdown).toContain("中低风险");
    expect(markdown).toContain("招商基金管理有限公司");
    expect(markdown).toContain("中国银行股份有限公司");
    expect(markdown).toContain("2012-03-20");
    expect(markdown).toContain("485.6");
    expect(markdown).toContain("0.01");
    expect(markdown).toContain("4.5");
    expect(markdown).toContain("5.4");
    expect(markdown).toContain("0.85");
    expect(markdown).toContain("中债综合指数");
  });

  it("renders Ch2 manager table when multiple managers", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      managerSection: `| 姓名 | 任职起始 | 任职结束 |
|------|----------|----------|
| 马龙 | 2015-04-13 | 至今 |
| 张三 | 2020-01-01 | 至今 |`,
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown).toContain("马龙");
    expect(markdown).toContain("张三");
    expect(markdown).toContain("2015-04-13");
  });

  it("renders Ch4 fee table with all fee types", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      managementFee: 0.6,
      custodyFee: 0.2,
      subscriptionMax: "1.2%",
      purchaseMax: "1.5%",
      redemptionMax: "0.5% (<7天)",
      salesServiceFee: 0.25,
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown).toContain("0.60%");
    expect(markdown).toContain("0.20%");
    expect(markdown).toContain("1.2%");
    expect(markdown).toContain("1.5%");
    expect(markdown).toContain("销售服务费");
    expect(markdown).toContain("0.25%");
  });

  it("renders Ch5 top 5 bond holdings section when provided", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      top5BondHoldingsSection: `| 序号 | 债券名称 | 发行主体 | 占净值比例 | 剩余期限 |
|------|---------|---------|------------|----------|
| 1 | 24电网MTN001 | 国家电网 | 4.20% | 2.5年 |
| 2 | 25中石油MTN001 | 中国石油 | 3.80% | 4.5年 |

*数据来自 2026 年 Q2 季报*`,
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown).toContain("24电网MTN001");
    expect(markdown).toContain("国家电网");
    expect(markdown).toContain("4.20%");
    expect(markdown).toContain("2026 年 Q2");
  });

  it("skips Ch6 holder structure section when empty", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      holderStructureSection: "",
    };
    const { markdown, chartCount } = buildBondFundReportMarkdown(params);
    expect(markdown).not.toMatch(/持有人结构/);
    expect(chartCount).toBe(0);
  });

  it("renders Ch6 holder structure with echarts fence when provided", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      holderStructureSection: `截至 2025 年末，个人投资者占比 25.20%，机构投资者占比 74.80%。

\`\`\`echarts
{
  "title": { "text": "持有人结构" },
  "series": [
    { "type": "pie", "data": [
      { "value": 74.80, "name": "机构投资者" },
      { "value": 25.20, "name": "个人投资者" }
    ]}
  ]
}
\`\`\``,
    };
    const { markdown, chartCount } = buildBondFundReportMarkdown(params);
    expect(markdown).toMatch(/持有人结构/);
    expect(markdown).toContain("个人投资者占比 25.20%");
    expect(markdown).toContain("```echarts");
    expect(markdown).toContain('"持有人结构"');
    expect(markdown).toContain('"机构投资者"');
    expect(markdown).toContain('"个人投资者"');
    expect(markdown).not.toContain("holder-pie-217022");
    expect(markdown).not.toContain("echarts.init");
    expect(chartCount).toBe(1);
  });

  it("does not duplicate the 引用说明 heading", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      footnotesMarkdown: "[^1]: 基金产品资料概要 · http://example.com",
      citeSection: `## 引用说明

| 序号 | 文档名称 | 文档地址 |
|------|----------|----------|
| 1 | 基金产品资料概要 | [查看文档](http://example.com) |
`,
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    const matches = markdown.match(/^## 引用说明/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it("skips Ch3 scope and [^1] footnote when scopeExcerpt is empty", () => {
    const params: BondFundParams = {
      ...MINIMAL_PARAMS,
      scopeExcerpt: "   ",
      scopeFootnote: "[^1]",
    };
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown).not.toMatch(/^## 投资范围/m);
    expect(markdown).not.toContain("[^1]");
  });

  it("does not crash with empty optional fields", () => {
    const params: BondFundParams = {
      fundCode: "000000",
      fundName: "测试债券基金",
      fundType: "债券型",
      riskLevel: "低风险",
      navDate: "2026-01-01",
      ymd: "2026-01-01",
      dateLabel: "2026年01月01日",
      scopeExcerpt: "投资于债券等固定收益类资产。",
      managerSection: "",
      top5BondHoldingsSection: "",
      holderStructureSection: "",
      footnotesMarkdown: "",
      citeSection: "",
    };
    expect(() => buildBondFundReportMarkdown(params)).not.toThrow();
    const { markdown } = buildBondFundReportMarkdown(params);
    expect(markdown.length).toBeGreaterThan(100);
  });
});
