import fs from "node:fs";
import path from "node:path";

const SEND_DATE_RE =
  /送出日期[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const COMPILE_DATE_RE =
  /编制日期[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

const dateCache = new Map<string, string | undefined>();

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseFrontmatterUploadedAt(text: string): string | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return undefined;
  const fm = text.slice(4, end);
  const m = fm.match(/^uploaded_at:\s*(\d{4}-\d{2}-\d{2})/m);
  return m?.[1];
}

/** 文件名中的版本后缀，如 product-summary-202606 → 2026-06-01 */
function parseDateFromFilename(filePath: string): string | undefined {
  const base = path.basename(filePath, path.extname(filePath));
  const ym = base.match(/-(\d{4})(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}-01`;
  return undefined;
}

/** 从 vault 文档正文/frontmatter 解析来源报告发布日期（YYYY-MM-DD） */
export function resolveVaultDocPublishDate(
  text: string,
  filePath?: string,
): string | undefined {
  const send = text.match(SEND_DATE_RE);
  if (send) return toYmd(+send[1]!, +send[2]!, +send[3]!);

  const compile = text.match(COMPILE_DATE_RE);
  if (compile) return toYmd(+compile[1]!, +compile[2]!, +compile[3]!);

  const uploaded = parseFrontmatterUploadedAt(text);
  if (uploaded) return uploaded;

  if (filePath) {
    return parseDateFromFilename(filePath);
  }

  return undefined;
}

export function resolveVaultDocPublishDateFromPath(
  vaultRoot: string,
  filePath: string,
): string | undefined {
  const key = `${vaultRoot}:${filePath}`;
  if (dateCache.has(key)) return dateCache.get(key);

  const abs = path.join(vaultRoot, ...filePath.split("/"));
  if (!fs.existsSync(abs)) {
    dateCache.set(key, undefined);
    return undefined;
  }

  const text = fs.readFileSync(abs, "utf8");
  const date = resolveVaultDocPublishDate(text, filePath);
  dateCache.set(key, date);
  return date;
}

export function clearVaultDocDateCache(): void {
  dateCache.clear();
}
