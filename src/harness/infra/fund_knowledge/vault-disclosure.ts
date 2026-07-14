import fs from "node:fs";
import path from "node:path";
import { resolveVaultDirForFund } from "./vault-slug";

const RISK_LEVEL_RE =
  /(?:典型风险等级|风险等级)[^|\n]*\|\s*\*\*(R[1-5][^*]*)\*\*/;

function walkMd(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "raw") continue;
      files.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

/** 从 vault 招募书/产品概要解析对客风险等级（知识库优先） */
export function resolveVaultRiskLevel(
  vaultRoot: string,
  fundCode: string,
): string | undefined {
  const resolved = resolveVaultDirForFund(vaultRoot, fundCode);
  const fundDir = resolved.fundDir;

  const candidates = walkMd(fundDir)
    .filter((p) => {
      const rel = path.relative(fundDir, p).replace(/\\/g, "/");
      return (
        rel.startsWith("prospectus/") &&
        /product-summary|prospectus/i.test(path.basename(p))
      );
    })
    .sort((a, b) => {
      const score = (p: string) =>
        (/product-summary/i.test(p) ? 2 : 0) +
        (/2026/i.test(p) ? 1 : 0);
      return score(b) - score(a);
    });

  for (const file of candidates) {
    const text = fs.readFileSync(file, "utf8");
    const m = text.match(RISK_LEVEL_RE);
    if (m?.[1]) return m[1].trim();
    const inline = text.match(/\*\*(R[1-5]\s*[^*]+)\*\*（以销售机构评定为准）/);
    if (inline?.[1]) return inline[1].trim();
  }

  return undefined;
}
