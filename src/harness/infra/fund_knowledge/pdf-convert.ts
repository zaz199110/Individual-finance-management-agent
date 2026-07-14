import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getProjectRoot } from "@/lib/paths";
import { runPdfOcrOnMarkdown } from "./pdf-ocr";

const execFileAsync = promisify(execFile);

export interface PdfConvertResult {
  ok: boolean;
  page_count?: number;
  conversion_method?: "text" | "ocr" | "mixed";
  ocr_pages?: number[];
  ocr_images?: Record<string, string>;
  error?: string;
}

/**
 * Resolve Python executable cross-platform.
 * On macOS/Linux, prefers python3 (python often doesn't exist).
 * On Windows, tries python then py -3.
 * Respects PYTHON env var override.
 */
function resolvePython(): string {
  const envOverride = process.env.PYTHON;
  if (envOverride) return envOverride;

  const candidates =
    process.platform === "win32"
      ? ["python", "py", "python3"]
      : ["python3", "python"];

  for (const exe of candidates) {
    try {
      const result = spawnSync(exe, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      if (result.status === 0) return exe;
    } catch {
      // continue to next candidate
    }
  }

  // Fallback: hope for the best
  return process.platform === "win32" ? "python" : "python3";
}

export async function convertPdfFile(input: {
  pdfPath: string;
  outputMdPath: string;
  fundCode: string;
  docType: string;
  sourceFilename: string;
}): Promise<PdfConvertResult> {
  const script = path.join(
    getProjectRoot(),
    "seed",
    "scripts",
    "convert_pdf_file.py",
  );
  if (!fs.existsSync(script)) {
    return { ok: false, error: "PDF 转换脚本不存在" };
  }
  if (!fs.existsSync(input.pdfPath)) {
    return { ok: false, error: "PDF 文件不存在" };
  }

  const ocrDir = path.join(path.dirname(input.outputMdPath), ".ocr-tmp");

  try {
    const { stdout } = await execFileAsync(
      resolvePython(),
      [
        script,
        "--input",
        input.pdfPath,
        "--output",
        input.outputMdPath,
        "--fund-code",
        input.fundCode,
        "--doc-type",
        input.docType,
        "--source-filename",
        input.sourceFilename,
        "--ocr-dir",
        ocrDir,
      ],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim()) as PdfConvertResult & { ok: boolean };
    if (!parsed.ok) {
      return { ok: false, error: parsed.error ?? "PDF 转换失败" };
    }

    if (parsed.ocr_images && Object.keys(parsed.ocr_images).length > 0) {
      await runPdfOcrOnMarkdown({
        markdownPath: input.outputMdPath,
        ocrImages: parsed.ocr_images,
      });
    }

    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fitz|PyMuPDF|No module named/i.test(msg)) {
      return {
        ok: false,
        error: "未安装 PyMuPDF，请运行: pip install pymupdf",
      };
    }
    return { ok: false, error: msg };
  }
}
