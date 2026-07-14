import fs from "node:fs";
import path from "node:path";
import { webSearch } from "@/harness/tools/web_search";
import {
  parseFeeRatesFromSnippets,
  type ParsedFeeRates,
} from "@/lib/kb/disclosure-parse";
import { ALL_DOC_TYPES, MIN_DISCLOSURE_STANDARD } from "./doc-types";
import { rebuildIndex } from "./index-db";
import {
  getFundKnowledgeRoot,
  getSeedFundKnowledgeRoot,
} from "./paths";
import type { GatherStageHook } from "./waterfall";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  resolveVaultDirForFund,
} from "./vault-slug";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export interface EnrichFundKnowledgeResult {
  ok: boolean;
  skipped?: boolean;
  skip_reason?: string;
  files_written?: number;
  index_rebuilt?: number;
  vault_dir?: string;
  error?: string;
}

function utcNowIso(): string {
  return new Date().toISOString();
}

function findFundDirInRoot(root: string, fundCode: string): string | null {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && parseFundCodeFromVaultDir(entry.name) === fundCode) {
      return path.join(root, entry.name);
    }
  }
  return null;
}

function ensureDocTypeDirs(fundDir: string): void {
  for (const docType of ALL_DOC_TYPES) {
    fs.mkdirSync(path.join(fundDir, docType), { recursive: true });
    fs.mkdirSync(path.join(fundDir, "raw", docType), { recursive: true });
  }
}

function listMdFilesUnder(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMdFilesUnder(abs));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(abs);
    }
  }
  return out;
}

function fileIsRecentEnough(absPath: string): boolean {
  const stat = fs.statSync(absPath);
  const age = Date.now() - stat.mtimeMs;
  return age <= TWELVE_MONTHS_MS;
}

function describeMissingDocs(vaultRoot: string, fundCode: string): string {
  const fundDir = findFundDirInRoot(vaultRoot, fundCode);
  if (!fundDir) return `未找到基金 ${fundCode} 的知识库目录。`;

  const parts: string[] = [];
  for (const [docType, minCount] of Object.entries(MIN_DISCLOSURE_STANDARD)) {
    const dir = path.join(fundDir, docType);
    if (!fs.existsSync(dir)) {
      parts.push(`${docType}: 目录不存在（需≥${minCount}篇）`);
      continue;
    }
    const mdFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (docType === "prospectus") {
      if (mdFiles.length < minCount) parts.push(`${docType}: 当前${mdFiles.length}篇，需≥${minCount}篇`);
    } else {
      const recentCount = mdFiles.filter((f) => fileIsRecentEnough(path.join(dir, f))).length;
      if (recentCount < minCount) parts.push(`${docType}: 当前${recentCount}篇（总数${mdFiles.length}），需≥${minCount}篇（近12月）`);
    }
  }
  return parts.length ? `缺口：${parts.join("；")}。` : "";
}

/**
 * FK-ENRICH-01 · 最低披露集标准检查
 * 要求：4季报 + 2半年报 + 1年报 + 1产品说明 + ≥3专家观点
 * - prospectus（产品说明书）：仅需存在，不限时效
 * - 其他类型（季报/半年报/年报/专家观点）：需近 12 个月内更新的文件
 */
export function vaultHasMinimumDisclosure(
  vaultRoot: string,
  fundCode: string,
): boolean {
  const fundDir = findFundDirInRoot(vaultRoot, fundCode);
  if (!fundDir) return false;

  for (const [docType, minCount] of Object.entries(MIN_DISCLOSURE_STANDARD)) {
    const dir = path.join(fundDir, docType);
    if (!fs.existsSync(dir)) return false;

    const mdFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));

    if (docType === "prospectus") {
      // 产品说明书仅需存在 ≥1 份，不做时效性检查
      if (mdFiles.length < minCount) return false;
    } else {
      const recentCount = mdFiles.filter((f) =>
        fileIsRecentEnough(path.join(dir, f)),
      ).length;
      if (recentCount < minCount) return false;
    }
  }

  return true;
}

export function shouldEnrichFundKnowledge(
  fundCode: string,
  vaultRoot = getFundKnowledgeRoot(),
): boolean {
  if (process.env.HARNESS_SKIP_ENRICH === "1") return false;
  return !vaultHasMinimumDisclosure(vaultRoot, fundCode);
}

function copyDirMerge(src: string, dest: string): number {
  let copied = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirMerge(from, to);
    } else if (entry.isFile() && !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      copied += 1;
    }
  }
  return copied;
}

/** 从 seed 同步单基金 vault（缺文件则补，不覆盖已有） */
export function syncSeedFundToVault(fundCode: string): {
  copied: number;
  vault_dir: string | null;
} {
  const seedRoot = getSeedFundKnowledgeRoot();
  const seedDir = findFundDirInRoot(seedRoot, fundCode);
  if (!seedDir) return { copied: 0, vault_dir: null };

  const vaultRoot = getFundKnowledgeRoot();
  fs.mkdirSync(vaultRoot, { recursive: true });
  const seedDirName = path.basename(seedDir);
  const destDir = path.join(vaultRoot, seedDirName);
  const copied = copyDirMerge(seedDir, destDir);
  return { copied, vault_dir: destDir };
}

function writeEnrichMarkdown(input: {
  fundDir: string;
  docType: string;
  filename: string;
  fundCode: string;
  title: string;
  body: string;
  note: string;
}): string {
  const relDir = input.docType;
  fs.mkdirSync(path.join(input.fundDir, relDir), { recursive: true });
  const abs = path.join(input.fundDir, relDir, input.filename);
  if (fs.existsSync(abs)) return abs;

  const content = `---
source_filename: ${input.filename}
source_format: md
doc_type: ${input.docType}
conversion_method: web_enrich
uploaded_at: ${utcNowIso()}
content_hash: enrich-${input.fundCode}-${input.filename.replace(/\.md$/, "")}
fund_code: "${input.fundCode}"
note: "${input.note}"
---

# ${input.title}

${input.body}
`;
  fs.writeFileSync(abs, content, "utf8");
  return abs;
}

function formatFeeTable(fees: ParsedFeeRates): string {
  const rows: string[] = [
    "| 费用类型 | 费率 |",
    "|----------|------|",
  ];
  if (fees.management_pct != null) {
    rows.push(`| 管理费 | **${fees.management_pct}%** / 年 |`);
  }
  if (fees.custody_pct != null) {
    rows.push(`| 托管费 | **${fees.custody_pct}%** / 年 |`);
  }
  if (fees.subscription_max_pct != null) {
    rows.push(`| 申购费（前端） | **${fees.subscription_max_pct}%** |`);
  }
  if (rows.length <= 2) {
    rows.push("| 管理费 | 以最新产品资料概要为准 |");
    rows.push("| 托管费 | 以最新产品资料概要为准 |");
  }
  return rows.join("\n");
}

async function writeWebEnrichDocs(input: {
  fundCode: string;
  fundName: string;
  fundType?: string;
  riskLevel?: string;
  fundDir: string;
}): Promise<number> {
  let written = 0;
  const queries = [
    {
      id: "prospectus",
      query: `${input.fundName} ${input.fundCode} 基金产品资料概要 投资范围 费率`,
      docType: "prospectus",
      filename: "product-summary-web.md",
      title: `${input.fundName} · 基金产品资料概要（联网摘要）`,
    },
    {
      id: "quarterly",
      query: `${input.fundName} ${input.fundCode} 最新季报 前十大重仓 行业配置`,
      docType: "quarterly_report",
      filename: "latest-quarterly-web.md",
      title: `${input.fundName} · 最近一期季报摘要（联网）`,
    },
  ];

  const snippets: string[] = [];
  for (const task of queries) {
    try {
      const ws = await webSearch({ query: task.query, max_results: 5 });
      snippets.push(ws.summary, ...(ws.snippets ?? []));
      const excerpt = [ws.summary, ...(ws.snippets ?? [])]
        .filter(Boolean)
        .slice(0, 6)
        .map((s) => `- ${s.trim().slice(0, 280)}`)
        .join("\n");

      const target = path.join(input.fundDir, task.docType, task.filename);
      if (fs.existsSync(target)) continue;

      const body =
        task.id === "prospectus"
          ? buildProspectusBody(input, excerpt, snippets)
          : buildQuarterlyBody(input, excerpt);

      writeEnrichMarkdown({
        fundDir: input.fundDir,
        docType: task.docType,
        filename: task.filename,
        fundCode: input.fundCode,
        title: task.title,
        body,
        note: "FK-ENRICH-01 · 联网摘要落库 · 供 L1 FTS",
      });
      written += 1;
    } catch {
      /* 单任务失败继续 */
    }
  }

  if (written === 0) {
    writeEnrichMarkdown({
      fundDir: input.fundDir,
      docType: "prospectus",
      filename: "product-summary-fallback.md",
      fundCode: input.fundCode,
      title: `${input.fundName} · 产品概要（兜底）`,
      body: buildProspectusBody(input, "", snippets),
      note: "FK-ENRICH-01 · 联网不可用时的最小兜底",
    });
    written += 1;
  }

  return written;
}

function buildProspectusBody(
  input: {
    fundCode: string;
    fundName: string;
    fundType?: string;
    riskLevel?: string;
  },
  excerpt: string,
  snippets: string[],
): string {
  const fees = parseFeeRatesFromSnippets(snippets);
  return [
    "## 一、产品概况",
    "",
    "| 项目 | 内容 |",
    "|------|------|",
    `| 基金简称 | ${input.fundName} |`,
    `| 基金代码 | ${input.fundCode} |`,
    `| 基金类型 | ${input.fundType ?? "—"} |`,
    `| 风险等级 | ${input.riskLevel ?? "以销售机构评定为准"} |`,
    "",
    "## 二、投资范围",
    "",
    excerpt ||
      "- 投资范围与策略以基金管理人最新披露的产品资料概要及招募说明书为准。",
    "",
    "## 三、费率结构",
    "",
    formatFeeTable(fees),
    "",
    "## 四、风险揭示摘要",
    "",
    "- 本基金不保证盈利，亦不保证最低收益。",
    "- 市场风险、信用风险、流动性风险等详见完整法律文件。",
    "",
    "> 编制说明：本文件由 **FK-ENRICH-01** 从公开资讯整理，仅供 App 内检索与引用；请以基金公司最新法律文件为准。",
  ].join("\n");
}

function buildQuarterlyBody(
  input: { fundName: string; fundCode: string },
  excerpt: string,
): string {
  return [
    `报告摘要来源：公开披露的定期报告要点（${input.fundCode}）。`,
    "",
    "## 投资组合摘要",
    "",
    excerpt ||
      "- 具体持仓与行业配置请查阅基金管理人披露的完整季度报告。",
    "",
    "> 本摘要由 App 自动整理，不构成投资建议。",
  ].join("\n");
}

/** FK-ENRICH-01 · 完整报告前知识库预热 */
export async function enrichFundKnowledgeVault(input: {
  fundCode: string;
  fundName: string;
  fundType?: string;
  riskLevel?: string;
  onStage?: GatherStageHook;
}): Promise<EnrichFundKnowledgeResult> {
  const vaultRoot = getFundKnowledgeRoot();
  fs.mkdirSync(vaultRoot, { recursive: true });

  if (!shouldEnrichFundKnowledge(input.fundCode, vaultRoot)) {
    await input.onStage?.({
      task_key: "fund.prep.enrich.fetch",
      status: "done",
    });
    await input.onStage?.({
      task_key: "fund.prep.enrich.index",
      status: "done",
    });
    return {
      ok: true,
      skipped: true,
      skip_reason: "vault_complete",
      vault_dir: findFundDirInRoot(vaultRoot, input.fundCode) ?? undefined,
    };
  }

  try {
    await input.onStage?.({
      task_key: "fund.prep.enrich.fetch",
      status: "running",
    });

    const seedSync = syncSeedFundToVault(input.fundCode);
    let filesWritten = seedSync.copied;

    const { fundDir, dirName } = resolveVaultDirForFund(
      vaultRoot,
      input.fundCode,
      input.fundName,
    );
    if (!fs.existsSync(fundDir)) {
      fs.mkdirSync(fundDir, { recursive: true });
    }
    ensureDocTypeDirs(fundDir);

    if (!vaultHasMinimumDisclosure(vaultRoot, input.fundCode)) {
      filesWritten += await writeWebEnrichDocs({
        fundCode: input.fundCode,
        fundName: input.fundName,
        fundType: input.fundType,
        riskLevel: input.riskLevel,
        fundDir,
      });
    }

    await input.onStage?.({
      task_key: "fund.prep.enrich.fetch",
      status: "done",
    });
    await input.onStage?.({
      task_key: "fund.prep.enrich.index",
      status: "running",
    });

    const indexResult = rebuildIndex({
      vaultRoot,
      scope: "fund",
      fund_code: input.fundCode,
      logType: "manual_reindex",
    });

    await input.onStage?.({
      task_key: "fund.prep.enrich.index",
      status: indexResult.errors.length ? "failed" : "done",
    });

    const ok = vaultHasMinimumDisclosure(vaultRoot, input.fundCode);
    let error: string | undefined;
    if (!ok) {
      const missing = describeMissingDocs(vaultRoot, input.fundCode);
      error = `知识库预热后未达最低披露标准（需4季报+2半年报+1年报+1产品说明+≥3专家观点）。${missing}`;
    }
    return {
      ok,
      files_written: filesWritten,
      index_rebuilt: indexResult.rebuilt,
      vault_dir: fundDir,
      error,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await input.onStage?.({
      task_key: "fund.prep.enrich.fetch",
      status: "failed",
    });
    await input.onStage?.({
      task_key: "fund.prep.enrich.index",
      status: "failed",
    });
    return { ok: false, error: msg };
  }
}

export function listSeedFundCodes(): string[] {
  const seedRoot = getSeedFundKnowledgeRoot();
  if (!fs.existsSync(seedRoot)) return [];
  return fs
    .readdirSync(seedRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isVaultFundDir(d.name))
    .map((d) => parseFundCodeFromVaultDir(d.name)!)
    .filter(Boolean);
}
