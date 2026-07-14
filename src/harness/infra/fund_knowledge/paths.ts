import fs from "node:fs";
import path from "node:path";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundCodeFromVaultRelPath,
} from "@/lib/fund-knowledge/vault-dir";
import { getDataDir, getProjectRoot } from "@/lib/paths";

export function getFundKnowledgeRoot(): string {
  return path.join(getDataDir(), "fund-knowledge");
}

export function getSeedFundKnowledgeRoot(): string {
  return path.join(getProjectRoot(), "seed", "fund-knowledge");
}

export function getFundSemanticSeedPath(): string {
  return path.join(getProjectRoot(), "seed", "fund_semantic_entries.json");
}

export function fundKnowledgeDeepLink(params: {
  fundCode: string;
  filePath: string;
  line?: number;
}): string {
  const q = new URLSearchParams({
    fund: params.fundCode,
    path: params.filePath,
    line: String(params.line ?? 1),
  });
  return `/fund-knowledge?${q.toString()}`;
}

export function listVaultFundCodes(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isVaultFundDir(d.name))
    .map((d) => parseFundCodeFromVaultDir(d.name)!)
    .filter(Boolean);
}

export { parseFundCodeFromVaultDir, parseFundCodeFromVaultRelPath };
