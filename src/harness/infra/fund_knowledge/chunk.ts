import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isVaultFundDir, parseFundCodeFromVaultDir } from "@/lib/fund-knowledge/vault-dir";

export interface KnowledgeChunk {
  chunk_id: string;
  fund_code: string;
  doc_type: string;
  file_path: string;
  heading: string;
  heading_level: number;
  line_start: number;
  line_end: number;
  content: string;
}

/** PRD §9.2.0d：单块默认 ≤ ~1500 字符 */
export const MAX_CHUNK_CHARS = 1500;

const MD_HEADING_RE = /^(#{1,3})\s+(.+)$/;
const CN_SECTION_RE = /^([一二三四五六七八九十百]+)[、．.\s]+(.+?)\s*$/;
const CN_SUBSECTION_RE = /^\(([一二三四五六七八九十\d]+)\)\s*(.*)$/;
const BRACKET_HEADING_RE = /^【([^】]+)】\s*$/;
const PAGE_MARKER_RE = /^<!--\s*第\s*(\d+)\s*页\s*-->$/;
const TOC_LINE_RE = /^[一二三四五六七八九十百]+[、．.].*\.{4,}/;

interface SectionDraft {
  heading: string;
  headingLevel: number;
  lines: string[];
  startLine: number;
}

/** Normalize Windows/macOS line endings so frontmatter + heading split work. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseFrontmatter(text: string): {
  meta: Record<string, string>;
  body: string;
  bodyOffset: number;
} {
  if (!text.startsWith("---\n")) {
    return { meta: {}, body: text, bodyOffset: 0 };
  }
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { meta: {}, body: text, bodyOffset: 0 };
  const fm = text.slice(4, end);
  const meta: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*"?(.+?)"?\s*$/i);
    if (m) meta[m[1]!] = m[2]!;
  }
  const body = text.slice(end + 5);
  const bodyOffset = text.slice(0, end + 5).split("\n").length;
  return { meta, body, bodyOffset };
}

/** Map body line index to 1-based file line number (body may start with leading blank after ---). */
function bodyLineToFileLine(bodyOffset: number, bodyIndex: number): number {
  return bodyOffset + bodyIndex;
}

function slugifyChunkId(
  fundCode: string,
  fileHash: string,
  lineStart: number,
  seq: number,
): string {
  const short = fileHash.slice(0, 8);
  return `fk_${fundCode}_${short}_${lineStart}_${seq}`;
}

function isTocLine(trimmed: string): boolean {
  if (TOC_LINE_RE.test(trimmed)) return true;
  return /^[一二三四五六七八九十百]+[、．.].*\s+\d+\s*$/.test(trimmed) && trimmed.includes(".");
}

function detectHeading(trimmed: string): { heading: string; level: number } | null {
  const page = trimmed.match(PAGE_MARKER_RE);
  if (page) {
    return { heading: `第${page[1]}页`, level: 3 };
  }

  const md = trimmed.match(MD_HEADING_RE);
  if (md) {
    return { heading: md[2]!.trim(), level: md[1]!.length };
  }

  const bracket = trimmed.match(BRACKET_HEADING_RE);
  if (bracket) {
    return { heading: bracket[1]!.trim(), level: 2 };
  }

  const sub = trimmed.match(CN_SUBSECTION_RE);
  if (sub) {
    const tail = sub[2]!.trim();
    return {
      heading: tail ? `(${sub[1]}) ${tail}` : `(${sub[1]})`,
      level: 3,
    };
  }

  if (!isTocLine(trimmed)) {
    const cn = trimmed.match(CN_SECTION_RE);
    if (cn) {
      const title = cn[2]!.trim();
      if (title && !title.includes("....")) {
        return { heading: `${cn[1]!}、${title.replace(/^[、．.\s]+/, "")}`, level: 2 };
      }
    }
  }

  return null;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && !out[out.length - 1]!.trim()) {
    out.pop();
  }
  return out;
}

function flushSection(sections: SectionDraft[], draft: SectionDraft | null): SectionDraft | null {
  if (!draft) return null;
  const lines = trimTrailingBlankLines(draft.lines);
  const content = lines.join("\n").trim();
  if (!content) return null;
  sections.push({ ...draft, lines });
  return null;
}

function buildSections(bodyLines: string[], bodyOffset: number): SectionDraft[] {
  const sections: SectionDraft[] = [];
  let draft: SectionDraft | null = {
    heading: "正文",
    headingLevel: 0,
    lines: [],
    startLine: bodyOffset,
  };

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    const lineNo = bodyLineToFileLine(bodyOffset, i);
    const trimmed = line.trim();
    const heading = trimmed ? detectHeading(trimmed) : null;

    if (heading) {
      draft = flushSection(sections, draft);
      draft = {
        heading: heading.heading,
        headingLevel: heading.level,
        lines: [line],
        startLine: lineNo,
      };
      continue;
    }

    if (!draft) {
      draft = { heading: "正文", headingLevel: 0, lines: [], startLine: lineNo };
    }
    if (!draft.lines.length && trimmed) {
      draft.startLine = lineNo;
    }
    draft.lines.push(line);
  }

  flushSection(sections, draft);
  return sections;
}

function packLineGroups(
  lines: string[],
  startLine: number,
  maxChars: number,
): Array<{ lines: string[]; startLine: number; endLine: number }> {
  const parts: Array<{ lines: string[]; startLine: number; endLine: number }> = [];
  let buf: string[] = [];
  let partStart = startLine;
  let len = 0;

  const flush = (endLine: number) => {
    if (!buf.length) return;
    parts.push({ lines: buf, startLine: partStart, endLine: endLine });
    buf = [];
    len = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = startLine + i;
    const addLen = line.length + (buf.length ? 1 : 0);

    if (buf.length && len + addLen > maxChars) {
      flush(lineNo - 1);
      partStart = lineNo;
    }

    if (!buf.length) partStart = lineNo;
    buf.push(line);
    len += addLen;

    if (len > maxChars && buf.length === 1) {
      flush(lineNo);
      partStart = lineNo + 1;
    }
  }

  if (buf.length) flush(startLine + lines.length - 1);
  return parts;
}

function splitByPageMarkers(section: SectionDraft): SectionDraft[] | null {
  const markers: number[] = [];
  for (let i = 0; i < section.lines.length; i++) {
    const trimmed = section.lines[i]!.trim();
    if (PAGE_MARKER_RE.test(trimmed)) markers.push(i);
  }
  if (markers.length <= 1) return null;

  const parts: SectionDraft[] = [];
  let sliceStart = 0;
  for (let m = 1; m < markers.length; m++) {
    const endIdx = markers[m]! - 1;
    const lines = section.lines.slice(sliceStart, endIdx + 1);
    const content = lines.join("\n").trim();
    if (content) {
      parts.push({
        heading: section.heading,
        headingLevel: section.headingLevel,
        lines,
        startLine: section.startLine + sliceStart,
      });
    }
    sliceStart = markers[m]!;
  }
  const tail = section.lines.slice(sliceStart);
  if (tail.join("\n").trim()) {
    parts.push({
      heading: section.heading,
      headingLevel: section.headingLevel,
      lines: tail,
      startLine: section.startLine + sliceStart,
    });
  }

  return parts.length > 1 ? parts : null;
}

function splitByParagraphs(section: SectionDraft): SectionDraft[] {
  const paragraphs: string[][] = [];
  let current: string[] = [];

  for (const line of section.lines) {
    if (!line.trim() && current.length) {
      paragraphs.push(current);
      current = [];
      continue;
    }
    if (!line.trim() && !current.length) continue;
    current.push(line);
  }
  if (current.length) paragraphs.push(current);

  if (paragraphs.length <= 1) {
    return packLineGroups(section.lines, section.startLine, MAX_CHUNK_CHARS).map((p, idx) => ({
      heading:
        idx === 0 ? section.heading : `${section.heading} · 续${idx + 1}`,
      headingLevel: section.headingLevel,
      lines: p.lines,
      startLine: p.startLine,
    }));
  }

  const parts: SectionDraft[] = [];
  let buf: string[] = [];
  let bufStart = section.startLine;
  let bufLen = 0;
  let partIdx = 0;

  const flushPart = (endLine: number) => {
    if (!buf.length) return;
    partIdx += 1;
    parts.push({
      heading: partIdx === 1 ? section.heading : `${section.heading} · 续${partIdx}`,
      headingLevel: section.headingLevel,
      lines: [...buf],
      startLine: bufStart,
    });
    buf = [];
    bufLen = 0;
  };

  let lineCursor = section.startLine;
  for (const para of paragraphs) {
    const paraLen = para.join("\n").length;
    const addLen = paraLen + (buf.length ? 1 : 0);

    if (buf.length && bufLen + addLen > MAX_CHUNK_CHARS) {
      flushPart(lineCursor - 1);
      bufStart = lineCursor;
    }

    if (!buf.length) bufStart = lineCursor;
    buf.push(...para);
    bufLen = buf.join("\n").length;
    lineCursor += para.length;

    if (bufLen > MAX_CHUNK_CHARS) {
      const packed = packLineGroups(buf, bufStart, MAX_CHUNK_CHARS);
      for (let i = 0; i < packed.length; i++) {
        partIdx += 1;
        parts.push({
          heading:
            partIdx === 1 ? section.heading : `${section.heading} · 续${partIdx}`,
          headingLevel: section.headingLevel,
          lines: packed[i]!.lines,
          startLine: packed[i]!.startLine,
        });
      }
      buf = [];
      bufLen = 0;
      bufStart = lineCursor;
    }
  }

  flushPart(section.startLine + section.lines.length - 1);
  return parts.length ? parts : [section];
}

function subdivideOversizedSection(section: SectionDraft): SectionDraft[] {
  const content = section.lines.join("\n").trim();
  if (content.length <= MAX_CHUNK_CHARS) return [section];

  const byPage = splitByPageMarkers(section);
  if (byPage) {
    const out: SectionDraft[] = [];
    for (const part of byPage) {
      out.push(...subdivideOversizedSection(part));
    }
    return out;
  }

  return splitByParagraphs(section);
}

function finalizeSections(sections: SectionDraft[]): SectionDraft[] {
  const out: SectionDraft[] = [];
  for (const section of sections) {
    out.push(...subdivideOversizedSection(section));
  }
  return out;
}

export function chunkMarkdownFile(params: {
  fundCode: string;
  docType: string;
  filePath: string;
  absolutePath: string;
}): KnowledgeChunk[] {
  const text = normalizeNewlines(fs.readFileSync(params.absolutePath, "utf8"));
  const fileHash = crypto.createHash("sha256").update(text).digest("hex");
  const { meta, body, bodyOffset } = parseFrontmatter(text);
  const bodyLines = body.split("\n");
  const chunks: KnowledgeChunk[] = [];
  let seq = 0;

  if (Object.keys(meta).length) {
    chunks.push({
      chunk_id: slugifyChunkId(params.fundCode, fileHash, 1, seq++),
      fund_code: params.fundCode,
      doc_type: params.docType,
      file_path: params.filePath,
      heading: "frontmatter",
      heading_level: 0,
      line_start: 1,
      line_end: bodyOffset,
      content: Object.entries(meta)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    });
  }

  const sections = finalizeSections(buildSections(bodyLines, bodyOffset));

  for (const section of sections) {
    const endLine = section.startLine + section.lines.length - 1;
    chunks.push({
      chunk_id: slugifyChunkId(params.fundCode, fileHash, section.startLine, seq++),
      fund_code: params.fundCode,
      doc_type: params.docType,
      file_path: params.filePath,
      heading: section.heading,
      heading_level: section.headingLevel,
      line_start: section.startLine,
      line_end: endLine,
      content: section.lines.join("\n").trim(),
    });
  }

  return chunks;
}

/** Ensure stored line ranges match chunk content (guards heading/body drift on index). */
export function assertChunkLineAlignment(
  chunks: KnowledgeChunk[],
  absolutePath: string,
): void {
  const lines = normalizeNewlines(fs.readFileSync(absolutePath, "utf8")).split("\n");
  for (const chunk of chunks) {
    if (chunk.heading === "frontmatter") continue;
    const slice = lines.slice(chunk.line_start - 1, chunk.line_end).join("\n").trim();
    if (slice !== chunk.content) {
      throw new Error(
        `Chunk line/content mismatch for "${chunk.heading}" (L${chunk.line_start}-${chunk.line_end})`,
      );
    }
  }
}

export function loadVaultChunks(vaultRoot: string, fundCode?: string): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  if (!fs.existsSync(vaultRoot)) return out;

  for (const dir of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (!dir.isDirectory() || !isVaultFundDir(dir.name)) continue;
    const code = parseFundCodeFromVaultDir(dir.name)!;
    if (fundCode && code !== fundCode) continue;

    const fundDir = path.join(vaultRoot, dir.name);
    for (const mdPath of walkMd(fundDir, fundDir)) {
      const rel = path.relative(vaultRoot, mdPath).replace(/\\/g, "/");
      const parts = rel.split("/");
      const docType = parts.length > 2 ? parts[1]! : "other";
      out.push(
        ...chunkMarkdownFile({
          fundCode: code,
          docType,
          filePath: rel,
          absolutePath: mdPath,
        }),
      );
    }
  }
  return out;
}

function walkMd(dir: string, vaultRoot: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "raw") continue;
      files.push(...walkMd(full, vaultRoot));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}
