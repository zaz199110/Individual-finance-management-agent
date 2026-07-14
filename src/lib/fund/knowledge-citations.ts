import type { WebSearchCitation } from "@/harness/tools/web_search.types";
import type { ExploreHit } from "@/harness/infra/fund_knowledge/explore";

export interface KnowledgeCitation {
  ref: number;
  fund_code: string;
  file_path: string;
  heading: string;
  line_start: number;
  chunk_id: string;
  deep_link: string;
  doc_label: string;
  /** 来源报告发布日期 YYYY-MM-DD */
  source_as_of?: string;
}

export function buildKnowledgeCitations(hits: ExploreHit[]): KnowledgeCitation[] {
  return hits.map((h, i) => ({
    ref: i + 1,
    fund_code: h.fund_code,
    file_path: h.file_path,
    heading: h.heading,
    line_start: h.line_start,
    chunk_id: h.chunk_id,
    deep_link: h.deep_link,
    doc_label: h.heading || h.doc_type,
    source_as_of: h.source_as_of,
  }));
}

/** 知识库摘录前的数据截止说明 */
export function formatVaultDataAsOfLine(asOf?: string): string {
  if (!asOf) return "";
  return `*本段数据截止 **${asOf}**（来源报告发布时间）*`;
}

export function formatVaultSourcedExcerpt(
  excerpt: string,
  asOf: string | undefined,
  enabled: boolean,
): string {
  if (!enabled || !asOf || !excerpt.trim()) return excerpt;
  return `${formatVaultDataAsOfLine(asOf)}\n\n${excerpt}`;
}

const WEB_CITATION_DISCLAIMER =
  "*以上链接来自 **公开互联网检索**，仅供查阅原始材料，**不代表推荐**；**不是** App 内招募书原文。*";

/** 无 vault · 联网引用表（标题可点 · 与延伸阅读分节） */
export function formatWebCitationsTable(
  webCitations: WebSearchCitation[],
): string {
  if (!webCitations.length) {
    return "（本轮暂无联网延伸阅读。）";
  }

  const rows = webCitations
    .map(
      (c) =>
        `| [${escapeTableCell(c.title)}](${c.url}) | 公开摘要 · **不代表推荐** |`,
    )
    .join("\n");

  return `## 延伸阅读（公开资讯）

| 标题 | 说明 |
|------|------|
${rows}

${WEB_CITATION_DISCLAIMER}`;
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

/** 对客引用说明表（FK-CITE · 不含 chunk_id） */
export function formatFkCiteSection(
  citations: KnowledgeCitation[],
  hasVault: boolean,
  webCitations: WebSearchCitation[] = [],
): string {
  if (!hasVault || !citations.length) {
    const webBlock = formatWebCitationsTable(webCitations);

    return `## 参考来源说明

本基金 **暂未纳入** App 本地基金知识库（或本轮未命中可溯源招募书片段）。正文中的费率、投资范围、风险等级等 **硬事实** 来自 **授权行情数据** 与 **公开联网检索**，请以基金公司最新法律文件为准。

${webBlock}
`;
  }

  const rows = citations.map((c) => {
    const asOfCell = c.source_as_of ? c.source_as_of : "—";
    return `| ${c.ref} | [${escapeTableCell(c.doc_label)}](${c.deep_link}) | ${asOfCell} |`;
  });

  return `## 引用说明 · 可查看招募书原文

| 序号 | 章节 | 数据截止 |
|------|------|----------|
${rows.join("\n")}
`;
}

export function formatInlineFootnote(ref: number): string {
  return `[^${ref}]`;
}

export function formatFootnoteDefinitions(citations: KnowledgeCitation[]): string {
  if (!citations.length) return "";
  return citations
    .map((c) => {
      const asOf = c.source_as_of ? ` · 数据截止 ${c.source_as_of}` : "";
      return `[^${c.ref}]: ${c.doc_label}${asOf} · ${c.deep_link}`;
    })
    .join("\n");
}

export function formatWebFootnoteDefinitions(
  citations: WebSearchCitation[],
): string {
  if (!citations.length) return "";
  return citations
    .map((c, i) => `[^${i + 1}]: ${c.title} · [延伸阅读](${c.url})`)
    .join("\n");
}
