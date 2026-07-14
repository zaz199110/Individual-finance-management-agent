import path from "node:path";
import mammoth from "mammoth";
import { fetchLiveFundL0 } from "@/lib/l0/fetch-fund-l0";
import { webSearch } from "@/harness/tools/web_search";
import { sanitizeFundChineseName } from "@/lib/fund-knowledge/vault-dir";

export type FundNameSource =
  | "override"
  | "document"
  | "tushare"
  | "akshare"
  | "registry"
  | "web"
  | "fallback";

export interface ResolvedFundChineseName {
  name: string;
  source: FundNameSource;
}

const NAME_BODY =
  "[\\u4e00-\\u9fff（）()A-Za-z0-9·\\u00b7]+(?:混合|基金|指数|债券|货币|ETF|QDII|持有期|联接|分级)?[\\u4e00-\\u9fff（）()A-Za-z0-9·\\u00b7]*";

function isPlausibleFundName(name: string, fundCode: string): boolean {
  const trimmed = sanitizeFundChineseName(name);
  if (trimmed.length < 4 || trimmed.length > 60) return false;
  if (trimmed === fundCode || trimmed === "基金" || /^Fund$/i.test(trimmed)) return false;
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return false;
  return true;
}

/** 从文本中提取与 fund_code 对应的简体中文基金名称 */
export function extractFundNameFromText(text: string, fundCode: string): string | null {
  if (!text.trim()) return null;

  const plain = text.replace(/\*\*/g, "");
  const patterns: RegExp[] = [
    /fund_name:\s*["']?([^"'\n]+)["']?/i,
    /基金(?:简称|名称|全称)[：:]\s*([^\n，,；;]+)/,
    new RegExp(`适用基金[：:]\\s*${fundCode}\\s+(${NAME_BODY})`),
    new RegExp(`${fundCode}\\s+(${NAME_BODY})`),
    new RegExp(`${fundCode}[：:，,\\s]+(${NAME_BODY})`),
  ];

  for (const source of [text, plain]) {
    for (const re of patterns) {
      const m = source.match(re);
      const candidate = sanitizeFundChineseName(m?.[1] ?? "");
      if (isPlausibleFundName(candidate, fundCode)) return candidate;
    }
  }
  return null;
}

async function bufferToSearchText(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".md" || ext === ".txt") {
    return buffer.toString("utf8");
  }
  if (ext === ".docx" || ext === ".doc") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return "";
    }
  }
  if (ext === ".pdf") {
    return buffer.toString("utf8").slice(0, 120_000);
  }
  return buffer.toString("utf8").slice(0, 80_000);
}

export async function extractFundNameFromUploadFilesAsync(
  fundCode: string,
  files: Array<{ filename: string; buffer: Buffer }>,
): Promise<string | null> {
  for (const file of files) {
    const text = await bufferToSearchText(file.buffer, file.filename);
    const name = extractFundNameFromText(text, fundCode);
    if (name) return name;
  }
  return null;
}

async function resolveFromMarketApis(fundCode: string): Promise<ResolvedFundChineseName | null> {
  const snapshot = await fetchLiveFundL0(fundCode);
  if (!snapshot?.fund_name?.trim()) return null;

  const name = sanitizeFundChineseName(snapshot.fund_name);
  if (!isPlausibleFundName(name, fundCode)) return null;

  const source: FundNameSource =
    snapshot.lookup_source === "tushare"
      ? "tushare"
      : snapshot.lookup_source === "akshare"
        ? "akshare"
        : snapshot.lookup_source === "registry_demo"
          ? "registry"
          : "fallback";

  return { name, source };
}

async function resolveFromWebSearch(fundCode: string): Promise<ResolvedFundChineseName | null> {
  if (process.env.HARNESS_SKIP_L0_WEB === "1") return null;

  try {
    const result = await webSearch({
      query: `${fundCode} 基金 简称 全称`,
      max_results: 5,
    });
    const haystack = [
      result.summary,
      ...result.citations.map((c) => `${c.title} ${c.url}`),
    ].join("\n");
    const name = extractFundNameFromText(haystack, fundCode);
    if (name) return { name, source: "web" };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 新建 vault 时解析基金简体中文名称：
 * 文档内容 → Tushare/AKShare → 联网搜索 → 兜底「基金」
 */
export async function resolveFundChineseName(input: {
  fundCode: string;
  files: Array<{ filename: string; buffer: Buffer }>;
  nameOverride?: string;
}): Promise<ResolvedFundChineseName> {
  const override = sanitizeFundChineseName(input.nameOverride ?? "");
  if (override && isPlausibleFundName(override, input.fundCode)) {
    return { name: override, source: "override" };
  }

  const fromDoc = await extractFundNameFromUploadFilesAsync(input.fundCode, input.files);
  if (fromDoc) return { name: fromDoc, source: "document" };

  const fromApi = await resolveFromMarketApis(input.fundCode);
  if (fromApi) return fromApi;

  const fromWeb = await resolveFromWebSearch(input.fundCode);
  if (fromWeb) return fromWeb;

  return { name: "基金", source: "fallback" };
}

export function fundNameSourceLabel(source: FundNameSource): string {
  switch (source) {
    case "override":
      return "手动指定";
    case "document":
      return "文档内容";
    case "tushare":
      return "Tushare";
    case "akshare":
      return "AKShare";
    case "registry":
      return "演示注册表";
    case "web":
      return "联网搜索";
    default:
      return "兜底规则";
  }
}
