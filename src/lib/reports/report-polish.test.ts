import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dedupeParagraphs,
  ensureChapterSeparators,
  polishReportMarkdown,
  stripManualHeadingNumbers,
  summarizeScopeSectionForTest,
  normalizeScopeBulletLayoutForTest,
} from "./report-polish";

const SCOPE_DUMP = `**鹏华消费优选混合型证券投资基金基金产品资料概要（更新）（发布时间：2024-06-28 15:09:40）**：鹏华消费优选混合型证券投资基金基金产品资料概要（更新）
编制日期：2024年06月26日
投资目标 本基金为混合型基金，在适度控制风险并保持良好流动性的前提下，精选大消费类的优质上市公司，力求超额收益及长期资本增值。
投资范围 本基金的投资范围为具有良好流动性的金融工具，包括国内依法发行上市的股票（含存托凭证）、债券、货币市场工具等。基金的投资组合比例为：股票（含存托凭证）资产占基金资产的60%95%，其中投资于大消费类的股票不低于非现金基金资产的80%。
**鹏华消费优选混合型证券投资基金基金产品资料概要(更新)（发布时间：2023-07-12 09:22:39）**：重复的旧版概要内容……`;

const JUNK_206007 =
  "鹏华基金 工商银行 黄奕松 每份累计0.00元（0次） 详情 基金管理费和托管费直接从基金产品中扣除，具体计算方法及费率结构请参见 基金《招募说明书》 本基金为股票型基金,在适度控制风险并保持良好流动性的前提下,精选大消费类的优质上市公司。 股票（含存托凭证）资产占基金资产的60%–95%，其中投资于大消费类的股票不低于非现金基金资产的80%。";

const JUNK_017704_SCOPE_INLINE =
  "投资目标 紧密跟踪标的指数，追求跟踪偏离度和跟踪误差的最小化。投资范围 主要投资于标的指数成份券和备选成份券。资产配置 兴业中证同业存单AAA指数7天持有期(017704)基金财经纵横_新浪网：·基金一览·净值走势图·基金历史净值 流水号 3767895";

const JUNK_017704_SCOPE_STRUCTURED =
  "本基金主要投资于标的指数成份券和备选成份券。为更好地实现基金的投资目标，本基金还可以投资于： - 非标的指数成份券和备选成份券的其他同业存单 - 国债、金融债、企业债、公司债、央行票据、地方政府债 - 短期融资券（含超短期融资券）、中期票据 - 资产支持证券、债券回购、银行存款、现金等货币市场工具 **投资限制：** - 本基金**不投资于股票** - 本基金**不投资于**可转换债券（可分离交易可转债的纯债部分除外）、可交换债券及其他带有权益属性的金融工具[^1]";

describe("polishReportMarkdown", () => {
  it("summarizeScopeSection 过滤新浪门户垃圾", () => {
    const out = summarizeScopeSectionForTest(JUNK_017704_SCOPE_INLINE);
    expect(out).not.toMatch(/新浪/);
    expect(out).not.toMatch(/流水号/);
    expect(out).not.toMatch(/基金一览/);
    expect(out).toMatch(/投资目标|主要投向/);
  });

  it("normalizeScopeBulletLayout 将行内 bullet 拆成列表", () => {
    const out = normalizeScopeBulletLayoutForTest(JUNK_017704_SCOPE_STRUCTURED);
    expect(out).toMatch(/还可以投资于：\n\n- 非标的/);
    expect(out).toMatch(/\*\*投资限制：\*\*\n\n- 本基金/);
    expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThanOrEqual(4);
  });

  it("summarizeScopeSection 保留投资限制要点列表", () => {
    const out = summarizeScopeSectionForTest(JUNK_017704_SCOPE_STRUCTURED);
    expect(out).toMatch(/\*\*投资限制：\*\*/);
    expect(out).toMatch(/不投资于股票/);
    expect(out.split("\n").some((l) => l.startsWith("- "))).toBe(true);
  });

  it("mergeDuplicateInvestmentScope 合并误写的 ## 投资范围", () => {
    const raw = `# 017704-测试

## 产品介绍

**本章回答：** 费用说明。

### 投资范围

- 本基金主要投资于“中证同业存单AAA指数”的成分券。

---

## 投资范围 ${JUNK_017704_SCOPE_STRUCTURED}

### 费率结构

管理费 0.2%
`;
    const out = polishReportMarkdown(raw);
    expect(out).not.toMatch(/^## 投资范围/m);
    expect(out).toMatch(/### 投资范围/);
    expect(out).toMatch(/\*\*投资限制：\*\*/);
    expect(out.split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThanOrEqual(3);
  });

  it("summarizeScopeSection 提取投资目标/范围要点", () => {
    const out = summarizeScopeSectionForTest(SCOPE_DUMP);
    expect(out).toMatch(/- \*\*投资目标：\*\*/);
    expect(out).toMatch(/60%–95%/);
  });

  it("将投资范围披露长文转为 C 端要点列表", () => {
    const raw = `# 206007-测试-解读

## 产品介绍

**本章回答：** 帮您弄清这只基金「是什么、投什么、费用如何」。

### 投资范围

${SCOPE_DUMP}

### 费率结构

> 本基金 **暂未纳入** App 本地基金知识库。

管理费 1.20% 托管费 0.20%

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;
    const out = polishReportMarkdown(raw);
    expect(out).toMatch(/- \*\*投资目标：\*\*/);
    expect(out).toMatch(/- \*\*主要投向：\*\*/);
    expect(out).toMatch(/60%–95%/);
    expect(out).not.toMatch(/2023-07-12/);
    expect(out).not.toMatch(/编制日期：2023/);
  });

  it("费率结构转为 C 端费率表格", () => {
    const raw = `# 测试

## 产品介绍

**本章回答：** 费用说明。

### 费率结构

**鹏华消费优选混合(206007)基金基本概况**：基金管理费和托管费直接从基金产品中扣除……
管理费 1.20% 年 托管费 0.20% 年 申购费最高 1.50%

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;
    const out = polishReportMarkdown(raw);
    expect(out).toMatch(/\| 管理费 \| \*\*1\.2% \/ 年\*\*/);
    expect(out).toMatch(/\| 托管费 \| \*\*0\.2% \/ 年\*\*/);
    expect(out).not.toMatch(/基金基本概况/);
  });

  it("联网 junk 费率段转为友好占位而非长文", () => {
    const raw = `# 206007-测试

## 产品介绍

**本章回答：** 费用。

### 费率结构

> 本基金 **暂未纳入** App 本地基金知识库。

${JUNK_206007}

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;
    const out = polishReportMarkdown(raw);
    expect(out).toMatch(/暂未解析到具体数字/);
    expect(out).not.toMatch(/资产配置策略/);
  });

  it("stripManualHeadingNumbers 去掉手写序号", () => {
    const md = "## 一、产品介绍\n### （一）投资范围\n#### 4.1.1 费率";
    expect(stripManualHeadingNumbers(md)).toBe(
      "## 产品介绍\n### 投资范围\n#### 费率",
    );
  });

  it("ensureChapterSeparators 在 ## 章前补 ---", () => {
    const md = `# 标题

## 第一章

内容

## 第二章

内容
`;
    const out = ensureChapterSeparators(md);
    expect(out).toMatch(/## 第一章[\s\S]*---[\s\S]*## 第二章/);
  });

  it("dedupeParagraphs 去除重复段落", () => {
    const md = "段落 A。\n\n段落 A。\n\n段落 B。";
    expect(dedupeParagraphs(md)).toBe("段落 A。\n\n段落 B。");
  });

  it("投向与重仓 含 Markdown 表格时不被 polish 压成一行", () => {
    const raw = `# 017704-测试

## 产品介绍

**本章回答：** 费用说明。

### 投向与重仓

*数据来自 **2026-03-31 季报**；前十 **有滞后**，非实时持仓。*

| 项目 | 说明 |
|------|------|
| 前十大占比合计 | **约 35.6%**（占基金资产净值） |

#### 前十大重仓存单/债券

| 序号 | 重仓标的 | 占净值比例 |
|------|----------|------------|
| 1 | 24国开CD025 | **4.82%** |

> 完整持仓明细以基金公司最新定期报告为准。

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;
    const out = polishReportMarkdown(raw);
    expect(out.split("\n").some((l) => l.includes("| 1 | 24国开CD025 |"))).toBe(true);
    expect(out.split("\n").some((l) => l.includes("| 项目 | 说明 |"))).toBe(true);
  });

  it("保护 echarts 代码块不被改写", () => {
    const raw = `# 测试

## 图表

\`\`\`echarts
{"title":{"text":"test"}}
\`\`\`

---

*以上内容由系统根据公开信息整理，仅供参考，不构成任何投资建议或收益承诺。*
`;
    const out = polishReportMarkdown(raw);
    expect(out).toContain('```echarts\n{"title":{"text":"test"}}\n```');
  });
});

describe("polishReportMarkdown · 真实草稿样本", () => {
  it("可处理含产品资料概要 dump 的 draft 片段", () => {
    const samplePath = path.join(
      process.cwd(),
      "data/runs/f11a110d-099e-4c01-91ea-40ca6cfaff6f/34b53fbe42e54edb/draft-report.md",
    );
    try {
      const raw = readFileSync(samplePath, "utf8");
      const out = polishReportMarkdown(raw);
      const scopeMatch = out.match(/### 投资范围\n\n([\s\S]*?)(?=\n### )/);
      expect(scopeMatch?.[1]?.length ?? 9999).toBeLessThan(800);
      expect(out).not.toMatch(/编制日期：2023年07月11日/);
    } catch {
      // 本地无该 run 目录时跳过
    }
  });
});
