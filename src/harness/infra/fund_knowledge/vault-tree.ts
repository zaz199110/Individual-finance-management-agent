import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ALL_DOC_TYPES, docTypeLabel } from "./doc-types";
import {
  getChunksForFile,
  getFileIndexStatus,
  getIndexSummary,
  type IndexStatus,
} from "./index-db";
import { getFundL0Profile } from "./l0-registry";
import { readCachedFundL0 } from "@/lib/l0/l0-sync";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundNameFromVaultDir,
} from "@/lib/fund-knowledge/vault-dir";

export interface VaultTreeFile {
  path: string;
  filename: string;
  index_status: IndexStatus;
  content_hash: string;
  chunk_count: number;
  updated_at: string | null;
}

export interface VaultTreeDocType {
  doc_type: string;
  label_zh: string;
  files: VaultTreeFile[];
}

export interface VaultTreeFund {
  fund_code: string;
  fund_name: string;
  vault_dir: string;
  doc_types: VaultTreeDocType[];
}

export interface VaultTreeResult {
  funds: VaultTreeFund[];
  summary: ReturnType<typeof getIndexSummary>;
}

function fileUpdatedAt(absPath: string): string | null {
  try {
    const stat = fs.statSync(absPath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

function resolveFundName(fundCode: string, vaultDir: string): string {
  return (
    getFundL0Profile(fundCode)?.fund_name ??
    readCachedFundL0(fundCode)?.fund_name ??
    parseFundNameFromVaultDir(vaultDir)
  );
}

export function buildVaultTree(
  vaultRoot: string,
  includeEmptyDocTypes = true,
): VaultTreeResult {
  const funds: VaultTreeFund[] = [];
  if (!fs.existsSync(vaultRoot)) {
    return { funds, summary: getIndexSummary(vaultRoot) };
  }

  for (const entry of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isVaultFundDir(entry.name)) continue;
    const fundCode = parseFundCodeFromVaultDir(entry.name)!;
    const fundDir = path.join(vaultRoot, entry.name);
    const docTypeMap = new Map<string, VaultTreeFile[]>();

    for (const absPath of walkMd(fundDir, vaultRoot)) {
      const rel = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
      const parts = rel.split("/");
      const docType = parts.length > 2 ? parts[1]! : "other";
      const chunks = getChunksForFile(vaultRoot, rel);
      let contentHash = "";
      try {
        const text = fs.readFileSync(absPath, "utf8");
        contentHash = `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`;
      } catch {
        contentHash = "";
      }

      const files = docTypeMap.get(docType) ?? [];
      files.push({
        path: rel,
        filename: path.basename(absPath),
        index_status: getFileIndexStatus(vaultRoot, rel),
        content_hash: contentHash,
        chunk_count: chunks.length,
        updated_at: fileUpdatedAt(absPath),
      });
      docTypeMap.set(docType, files);
    }

    const docTypes: VaultTreeDocType[] = [];
    const typesToShow = includeEmptyDocTypes ? [...ALL_DOC_TYPES] : [...docTypeMap.keys()];
    for (const dt of typesToShow) {
      docTypes.push({
        doc_type: dt,
        label_zh: docTypeLabel(dt),
        files: (docTypeMap.get(dt) ?? []).sort((a, b) =>
          a.filename.localeCompare(b.filename),
        ),
      });
    }

    // Deduplicate by fund_code: merge doc_types from multiple dirs
    const existing = funds.find((f) => f.fund_code === fundCode);
    if (existing) {
      for (const dt of docTypes) {
        const target = existing.doc_types.find((d) => d.doc_type === dt.doc_type);
        if (target) {
          target.files.push(...dt.files);
        } else {
          existing.doc_types.push(dt);
        }
      }
    } else {
      funds.push({
        fund_code: fundCode,
        fund_name: resolveFundName(fundCode, entry.name),
        vault_dir: entry.name,
        doc_types: docTypes,
      });
    }
  }

  funds.sort((a, b) => a.fund_code.localeCompare(b.fund_code));
  return { funds, summary: getIndexSummary(vaultRoot) };
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

export function driftScan(vaultRoot: string): {
  scanned_files: number;
  pending_refresh: number;
  index_failed: number;
  tree: VaultTreeResult;
} {
  const tree = buildVaultTree(vaultRoot, true);
  let pending = 0;
  let failed = 0;
  let scanned = 0;

  for (const fund of tree.funds) {
    for (const dt of fund.doc_types) {
      for (const file of dt.files) {
        scanned += 1;
        if (file.index_status === "pending_refresh") pending += 1;
        if (file.index_status === "index_failed") failed += 1;
      }
    }
  }

  return {
    scanned_files: scanned,
    pending_refresh: pending,
    index_failed: failed,
    tree,
  };
}
