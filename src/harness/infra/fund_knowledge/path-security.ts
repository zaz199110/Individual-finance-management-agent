import path from "node:path";
import { isVaultFundDir, parseFundCodeFromVaultRelPath } from "@/lib/fund-knowledge/vault-dir";

/** Validate relative vault path — no traversal, must be .md under fund dir. */
export function assertSafeVaultMdPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("ERR-FK-PATH-INVALID");
  }
  if (!normalized.endsWith(".md")) {
    throw new Error("ERR-FK-PATH-INVALID");
  }
  const parts = normalized.split("/");
  if (parts.length < 3 || !isVaultFundDir(parts[0]!)) {
    throw new Error("ERR-FK-PATH-INVALID");
  }
  if (parts.includes("raw")) {
    throw new Error("ERR-FK-PATH-INVALID");
  }
  return normalized;
}

export function resolveVaultFilePath(vaultRoot: string, relativePath: string): string {
  const safe = assertSafeVaultMdPath(relativePath);
  const abs = path.resolve(vaultRoot, safe);
  const rootResolved = path.resolve(vaultRoot);
  if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
    throw new Error("ERR-FK-PATH-INVALID");
  }
  return abs;
}
