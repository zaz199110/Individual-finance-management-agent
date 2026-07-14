import fs from "node:fs";
import path from "node:path";
import { getFundL0Profile } from "./l0-registry";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundNameFromVaultDir,
  sanitizeFundChineseName,
  vaultDirName as buildVaultDirName,
  VAULT_FUND_DIR_RE,
} from "@/lib/fund-knowledge/vault-dir";

export {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundNameFromVaultDir,
  sanitizeFundChineseName,
  VAULT_FUND_DIR_RE,
};
export { parseFundCodeFromVaultRelPath } from "@/lib/fund-knowledge/vault-dir";

/** `{fund_code} {简体中文名称}` — 优先 L0 注册表补全名称 */
export function vaultDirName(fundCode: string, chineseName?: string): string {
  const trimmed = sanitizeFundChineseName(chineseName?.trim() ?? "");
  const name = trimmed || getFundL0Profile(fundCode)?.fund_name || "基金";
  return buildVaultDirName(fundCode, name);
}

export function findExistingVaultDir(vaultRoot: string, fundCode: string): string | null {
  if (!fs.existsSync(vaultRoot)) return null;
  for (const entry of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && parseFundCodeFromVaultDir(entry.name) === fundCode) {
      return entry.name;
    }
  }
  return null;
}

export function resolveVaultDirForFund(
  vaultRoot: string,
  fundCode: string,
  chineseName?: string,
): { dirName: string; fundDir: string; created: boolean } {
  const existing = findExistingVaultDir(vaultRoot, fundCode);
  if (existing) {
    return {
      dirName: existing,
      fundDir: path.join(vaultRoot, existing),
      created: false,
    };
  }
  const dirName = vaultDirName(fundCode, chineseName);
  const fundDir = path.join(vaultRoot, dirName);
  return { dirName, fundDir, created: !fs.existsSync(fundDir) };
}
