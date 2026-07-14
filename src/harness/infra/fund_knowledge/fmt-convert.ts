import * as XLSX from "xlsx";
import mammoth from "mammoth";

export const FK_FMT_EXTENSIONS = [
  ".md",
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".xlsx",
  ".xls",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export type FkFmtExtension = (typeof FK_FMT_EXTENSIONS)[number];

export function isFkFmtExtension(ext: string): ext is FkFmtExtension {
  return (FK_FMT_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export interface FmtConvertResult {
  ok: boolean;
  markdown?: string;
  conversion_method?: "text" | "ocr" | "mixed";
  error?: string;
}

function escapeCell(value: unknown): string {
  const s = String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return s;
}

function rowsToMarkdownTable(rows: unknown[][]): string {
  if (!rows.length) return "（空表格）\n";
  const normalized = rows.map((row) =>
    row.map((cell) => escapeCell(cell)),
  );
  const width = Math.max(...normalized.map((r) => r.length));
  const padded = normalized.map((row) => {
    while (row.length < width) row.push("");
    return row;
  });
  const header = padded[0] ?? [];
  const body = padded.slice(1);
  const sep = header.map(() => "---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}

export function convertSpreadsheetToMarkdown(
  buffer: Buffer,
  ext: string,
  filename: string,
): FmtConvertResult {
  try {
    const wb =
      ext === ".csv"
        ? XLSX.read(buffer.toString("utf8"), { type: "string" })
        : XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [`# ${filename}\n`];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      }) as unknown[][];
      if (wb.SheetNames.length > 1) {
        parts.push(`## ${sheetName}\n`);
      }
      parts.push(rowsToMarkdownTable(rows));
    }
    return { ok: true, markdown: parts.join("\n"), conversion_method: "text" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "表格转换失败",
    };
  }
}

export async function convertDocxToMarkdown(buffer: Buffer): Promise<FmtConvertResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) {
      return { ok: false, error: "DOCX 未提取到文本" };
    }
    return {
      ok: true,
      markdown: `${text}\n`,
      conversion_method: "text",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "DOCX 转换失败",
    };
  }
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export async function convertImageToMarkdown(
  buffer: Buffer,
  ext: string,
  filename: string,
): Promise<FmtConvertResult> {
  const mime = mimeForExt(ext);
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const { callVisionDocumentOcr } = await import("@/harness/tools/vision_parse");
  const ocr = await callVisionDocumentOcr(dataUrl, filename);
  if (ocr.ok && ocr.text?.trim()) {
    return {
      ok: true,
      markdown: `${ocr.text.trim()}\n`,
      conversion_method: "ocr",
    };
  }
  return {
    ok: true,
    markdown: `## 图片 OCR 占位\n\n> 原件：\`${filename}\`\n\nVision 模型未配置或识别失败（${ocr.error ?? "无返回"}）。请在「设置 → 模型」完成图片理解检测后重新上传，或改传 PDF/Word/表格文件。\n`,
    conversion_method: "ocr",
  };
}

export function buildUploadFrontmatter(input: {
  fundCode: string;
  docType: string;
  sourceFilename: string;
  sourceFormat: string;
  conversionMethod: "text" | "ocr" | "mixed";
}): string {
  return `---
fund_code: "${input.fundCode}"
doc_type: "${input.docType}"
source_filename: "${input.sourceFilename}"
source_format: ${input.sourceFormat}
conversion_method: ${input.conversionMethod}
updated_at: "${new Date().toISOString()}"
---

`;
}

export async function convertUploadFileToMarkdown(input: {
  ext: string;
  buffer: Buffer;
  filename: string;
}): Promise<FmtConvertResult> {
  const ext = input.ext.toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    const text = input.buffer.toString("utf8");
    return { ok: true, markdown: text, conversion_method: "text" };
  }

  if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") {
    return convertSpreadsheetToMarkdown(input.buffer, ext, input.filename);
  }

  if (ext === ".docx") {
    return convertDocxToMarkdown(input.buffer);
  }

  if (ext === ".doc") {
    return {
      ok: false,
      error: "ERR-FK-FORMAT-UNSUPPORTED: 旧版 .doc 请另存为 .docx 后上传",
    };
  }

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return convertImageToMarkdown(input.buffer, ext, input.filename);
  }

  return { ok: false, error: "ERR-FK-FORMAT-UNSUPPORTED" };
}
