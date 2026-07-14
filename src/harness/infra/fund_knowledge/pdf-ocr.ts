import fs from "node:fs";
import path from "node:path";
import { callVisionDocumentOcr } from "@/harness/tools/vision_parse";

function pngToDataUrl(pngPath: string): string {
  const buf = fs.readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** FK-PDF-01 · 扫描页 Vision OCR 回退，替换 OCR_PENDING 占位符 */
export async function runPdfOcrOnMarkdown(input: {
  markdownPath: string;
  ocrImages: Record<string, string>;
}): Promise<{ ok: boolean; ocr_page_count: number; error?: string }> {
  if (!fs.existsSync(input.markdownPath)) {
    return { ok: false, ocr_page_count: 0, error: "Markdown 不存在。" };
  }

  let md = fs.readFileSync(input.markdownPath, "utf8");
  const entries = Object.entries(input.ocrImages);
  if (!entries.length) {
    return { ok: true, ocr_page_count: 0 };
  }

  let ocrCount = 0;
  for (const [pageStr, imgPath] of entries) {
    const page = Number(pageStr);
    const placeholder = `<!-- OCR_PENDING:${page} -->`;
    if (!md.includes(placeholder)) continue;
    if (!fs.existsSync(imgPath)) continue;

    const ocr = await callVisionDocumentOcr(
      pngToDataUrl(imgPath),
      `pdf-page-${page}.png`,
    );
    const replacement = ocr.ok && ocr.text?.trim()
      ? ocr.text.trim()
      : `<!-- 第 ${page} 页 OCR 未识别 -->`;
    md = md.replace(placeholder, replacement);
    if (ocr.ok) ocrCount += 1;

    try {
      fs.unlinkSync(imgPath);
    } catch {
      /* ignore */
    }
  }

  fs.writeFileSync(input.markdownPath, md, "utf8");

  const ocrDir = entries[0]?.[1] ? path.dirname(entries[0][1]) : null;
  if (ocrDir && fs.existsSync(ocrDir)) {
    try {
      if (!fs.readdirSync(ocrDir).length) fs.rmdirSync(ocrDir);
    } catch {
      /* ignore */
    }
  }

  return { ok: true, ocr_page_count: ocrCount };
}
