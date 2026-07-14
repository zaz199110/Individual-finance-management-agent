import { describe, expect, it } from "vitest";
import {
  buildFundReportEchartsMarkdown,
  countEchartsFences,
} from "@/lib/fund/echarts-skeleton";
import { parseMarkdown } from "@/lib/reports/markdown-render";

describe("fund echarts skeleton", () => {
  it("only embeds charts when L0 fields are present", () => {
    const { chapter1, chapter2, chapter4, chartCount } =
      buildFundReportEchartsMarkdown({
        fundCode: "019305",
        fundName: "样例 QDII 基金",
        archetype: "A",
        return1yPct: 15.2,
        benchmarkReturn1yPct: 12.1,
        benchmarkName: "沪深300",
        assetAllocation: { stock_pct: 90, bond_pct: 5, cash_pct: 5 },
        topHoldings: [
          { name: "样例", code: "00700", asset_type: "stock", weight_pct: 4.2 },
        ],
        parsedFees: { management_pct: 0.8, custody_pct: 0.2 },
      });

    expect(chartCount).toBeGreaterThanOrEqual(2);
    const md = `${chapter1}\n${chapter2}\n${chapter4}`;
    expect(countEchartsFences(md)).toBe(chartCount);
    expect(md).not.toMatch(/（骨架）/);
    expect(md).not.toMatch(/同类平均/);
  });

  it("parseMarkdown recognizes ```echarts fences", () => {
    const md = `# Demo

\`\`\`echarts
{"title":{"text":"test"},"series":[{"type":"pie","data":[]}]}
\`\`\`
`;
    const blocks = parseMarkdown(md, "published", new Set());
    const echartsBlocks = blocks.filter((b) => b.kind === "echarts");
    expect(echartsBlocks).toHaveLength(1);
    expect(echartsBlocks[0]?.echartsJson).toContain('"text":"test"');
  });
});
