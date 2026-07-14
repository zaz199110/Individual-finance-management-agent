export type LinkPolicy = "draft" | "published";

export interface RenderLink {
  href: string;
  label: string;
  clickable: boolean;
}

export interface RenderBlock {
  kind:
    | "heading"
    | "paragraph"
    | "blockquote"
    | "hr"
    | "table"
    | "list"
    | "echarts"
    | "mermaid"
    | "empty";
  level?: number;
  lines?: string[];
  headers?: string[];
  rows?: string[][];
  ordered?: boolean;
  items?: string[];
  inlines?: RenderInline[];
  /** Raw JSON string inside ```echarts fence */
  echartsJson?: string;
  /** Raw mermaid source inside ```mermaid fence */
  mermaidSource?: string;
}

export type RenderInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; label: string; clickable: boolean };

const REPORT_LINK_RE =
  /^\/reports(?:\/view)?\?(?:[^#]*&)?id=([0-9a-f-]{36})/i;
const EXTERNAL_LINK_RE = /^https?:\/\//i;
const FUND_KNOWLEDGE_LINK_RE = /^\/fund-knowledge(?:\?|$)/i;

export function isFundKnowledgeLink(href: string): boolean {
  return FUND_KNOWLEDGE_LINK_RE.test(href);
}

export function isExternalLink(href: string): boolean {
  return EXTERNAL_LINK_RE.test(href);
}

export function isLinkClickable(
  href: string,
  policy: LinkPolicy,
  validReportIds: Set<string>,
): boolean {
  if (isExternalLink(href)) return true;
  if (isFundKnowledgeLink(href)) return true;
  const match = href.match(REPORT_LINK_RE);
  if (!match) return policy === "published";
  const reportId = match[1]!.toLowerCase();
  return validReportIds.has(reportId);
}

export function parseInlineSegment(
  text: string,
  policy: LinkPolicy,
  validReportIds: Set<string>,
): RenderInline[] {
  const parts: RenderInline[] = [];
  let last = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Code span: `...`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        if (i > last) parts.push({ kind: "text", value: text.slice(last, i) });
        parts.push({ kind: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        last = i;
        continue;
      }
    }

    // Bold: **...**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        if (i > last) parts.push({ kind: "text", value: text.slice(last, i) });
        parts.push({ kind: "strong", value: text.slice(i + 2, end) });
        i = end + 2;
        last = i;
        continue;
      }
    }

    // Emphasis: *...* or _..._
    if (ch === "*" || ch === "_") {
      const end = text.indexOf(ch, i + 1);
      if (end !== -1) {
        if (i > last) parts.push({ kind: "text", value: text.slice(last, i) });
        parts.push({ kind: "em", value: text.slice(i + 1, end) });
        i = end + 1;
        last = i;
        continue;
      }
    }

    // Link: [...](...)
    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (
        closeBracket !== -1 &&
        text[closeBracket + 1] === "(" &&
        closeBracket + 1 < text.length
      ) {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          if (i > last)
            parts.push({ kind: "text", value: text.slice(last, i) });
          const label = text.slice(i + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen);
          parts.push({
            kind: "link",
            href,
            label,
            clickable: isLinkClickable(href, policy, validReportIds),
          });
          i = closeParen + 1;
          last = i;
          continue;
        }
      }
    }

    i += 1;
  }

  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }

  return parts.length ? parts : [{ kind: "text", value: text }];
}

function parseInlines(
  line: string,
  policy: LinkPolicy,
  validReportIds: Set<string>,
): RenderInline[] {
  return parseInlineSegment(line, policy, validReportIds);
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)?$/.test(line.trim());
}

/** GFM 脚注定义 / 文末脚注行 — 预览不渲染（引用表已承载可点链接） */
function isFootnoteMetaLine(line: string): boolean {
  return /^\[\^\d+\](?::|\s)/.test(line.trim());
}

export function parseMarkdown(
  markdown: string,
  policy: LinkPolicy,
  validReportIds: Set<string>,
): RenderBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: RenderBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (isFootnoteMetaLine(line)) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    if (line.trim() === "```echarts") {
      i += 1;
      const jsonLines: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "```") {
        jsonLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length && lines[i]!.trim() === "```") {
        i += 1;
      }
      blocks.push({ kind: "echarts", echartsJson: jsonLines.join("\n").trim() });
      continue;
    }

    if (line.trim() === "```mermaid") {
      i += 1;
      const mermaidLines: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "```") {
        mermaidLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length && lines[i]!.trim() === "```") {
        i += 1;
      }
      blocks.push({
        kind: "mermaid",
        mermaidSource: mermaidLines.join("\n").trim(),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        inlines: parseInlines(heading[2]!, policy, validReportIds),
      });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({
        kind: "blockquote",
        lines: quoteLines,
        inlines: parseInlines(quoteLines.join(" "), policy, validReportIds),
      });
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]!)) {
        rows.push(parseTableRow(lines[i]!));
        i += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: true, items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith(">") &&
      !lines[i]!.trim().startsWith("```") &&
      !isTableRow(lines[i]!) &&
      !/^---+$/.test(lines[i]!.trim()) &&
      !/^[-*]\s+/.test(lines[i]!) &&
      !/^\d+\.\s+/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i += 1;
    }
    // Guard: a line starting with '#' that is not a valid heading would
    // otherwise cause an infinite loop. Treat it as a paragraph line.
    if (paraLines.length === 0 && i < lines.length) {
      paraLines.push(lines[i]!);
      i += 1;
    }
    blocks.push({
      kind: "paragraph",
      inlines: parseInlines(paraLines.join(" "), policy, validReportIds),
    });
  }

  return blocks;
}
