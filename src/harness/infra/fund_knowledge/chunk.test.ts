import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chunkMarkdownFile, assertChunkLineAlignment, MAX_CHUNK_CHARS } from "./chunk";

describe("chunkMarkdownFile", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  function writeTmp(name: string, content: string): string {
    const file = path.join(os.tmpdir(), `fk-chunk-test-${Date.now()}-${name}.md`);
    fs.writeFileSync(file, content, "utf8");
    tmpFiles.push(file);
    return file;
  }

  it("splits ## / ### sections and frontmatter on CRLF files (Windows)", () => {
    const md = [
      "---\r\n",
      "fund_code: \"019305\"\r\n",
      "doc_type: semiannual_report\r\n",
      "---\r\n",
      "\r\n",
      "# 标题\r\n",
      "\r\n",
      "## 一、概况\r\n",
      "内容 A\r\n",
      "\r\n",
      "## 二、费率\r\n",
      "内容 B\r\n",
    ].join("");

    const file = writeTmp("crlf", md);
    const chunks = chunkMarkdownFile({
      fundCode: "019305",
      docType: "semiannual_report",
      filePath: "019305-test/semiannual_report/demo.md",
      absolutePath: file,
    });

    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain("frontmatter");
    expect(headings).toContain("一、概况");
    expect(headings).toContain("二、费率");
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });

  it("splits PDF-style plain headings and caps chunk size at 1500 chars", () => {
    const longPara = "这是一段较长的正文内容。".repeat(120);
    const md = [
      "---",
      'fund_code: "019305"',
      "---",
      "",
      "<!-- 第 1 页 -->",
      "一、 产品概况",
      "基金简称",
      "测试基金",
      "",
      "二、 费率说明",
      longPara,
      "",
      "(一) 申购费",
      "0.00%",
    ].join("\n");

    const file = writeTmp("pdf-style", md);
    const chunks = chunkMarkdownFile({
      fundCode: "019305",
      docType: "prospectus",
      filePath: "019305-test/prospectus/pdf-style.md",
      absolutePath: file,
    });

    expect(chunks.some((c) => c.heading.includes("产品概况"))).toBe(true);
    expect(chunks.some((c) => c.heading.includes("费率"))).toBe(true);
    expect(chunks.every((c) => c.content.length <= MAX_CHUNK_CHARS)).toBe(true);
    expect(chunks.length).toBeGreaterThan(4);
  });

  it("keeps section heading inside chunk content and excludes next heading (019305 Q4 quarterly)", () => {
    const md = [
      "---",
      'fund_code: "019305"',
      'doc_type: quarterly_report',
      "---",
      "",
      "# 标题",
      "",
      "## 二、地区分布",
      "| 美国 | 98% |",
      "",
      "## 三、行业分布（前五）",
      "",
      "| 行业 | 占比 |",
      "| 信息技术 | 32.5% |",
      "",
      "## 四、汇率影响说明",
      "汇率波动说明。",
    ].join("\n");

    const file = writeTmp("quarterly-sections", md);
    const chunks = chunkMarkdownFile({
      fundCode: "019305",
      docType: "quarterly_report",
      filePath: "019305-test/quarterly_report/q4.md",
      absolutePath: file,
    });

    const industry = chunks.find((c) => c.heading.includes("行业分布"));
    expect(industry).toBeDefined();
    expect(industry!.content.startsWith("## 三、行业分布")).toBe(true);
    expect(industry!.content).not.toContain("## 四、汇率");
    expect(industry!.content).toContain("| 信息技术 | 32.5% |");

    const fileLines = md.split("\n");
    const headingLine = fileLines.findIndex((l) => l.includes("三、行业分布")) + 1;
    const nextHeadingLine = fileLines.findIndex((l) => l.includes("四、汇率")) + 1;
    expect(industry!.line_start).toBe(headingLine);
    expect(industry!.line_end).toBeLessThan(nextHeadingLine);

    assertChunkLineAlignment(chunks, file);
  });
});