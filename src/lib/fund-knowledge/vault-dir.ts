/** Matches legacy `{code}-{slug}` and new `{code} {中文名}` vault dirs. */
export const VAULT_FUND_DIR_RE = /^\d{6}[ -]/;

export function isVaultFundDir(name: string): boolean {
  return VAULT_FUND_DIR_RE.test(name);
}

export function parseFundCodeFromVaultDir(dirName: string): string | null {
  const m = dirName.match(/^(\d{6})[ -]/);
  return m?.[1] ?? null;
}

export function parseFundCodeFromVaultRelPath(relativePath: string): string {
  const root = relativePath.replace(/\\/g, "/").split("/")[0] ?? "";
  return parseFundCodeFromVaultDir(root) ?? "";
}

export function parseFundNameFromVaultDir(dirName: string): string {
  const m = dirName.match(/^\d{6}[ -](.+)$/);
  if (!m) return dirName;
  return m[1]!.replace(/-/g, " ").trim();
}

export function sanitizeFundChineseName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** `{fund_code} {简体中文名称}` — FK-VAULT-01 */
export function vaultDirName(fundCode: string, chineseName?: string): string {
  const trimmed = sanitizeFundChineseName(chineseName?.trim() ?? "");
  const name = trimmed || "基金";
  return `${fundCode} ${name}`;
}
