import { ensureFundKnowledgeVault } from "@/harness/infra/fund_knowledge/bootstrap";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/paths";

const dataDir = getDataDir();
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });

const vaultRoot = ensureFundKnowledgeVault();
const vaultCount = fs.existsSync(vaultRoot)
  ? fs.readdirSync(vaultRoot).filter((n) => /^\d{6}-/.test(n)).length
  : 0;

console.log(`Data directory: ${dataDir}`);
console.log(`Fund knowledge vault: ${vaultRoot} (${vaultCount} fund folder(s))`);
console.log(
  vaultCount === 0
    ? "Note: vault empty — fund reports will use L0 + web fallback (FK-CITE-NOVAULT-01)."
    : "Seed vault copied — FK-CITE deep links available for seeded funds.",
);
