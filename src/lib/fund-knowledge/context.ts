import { ensureFundKnowledgeVault } from "@/harness/infra/fund_knowledge/bootstrap";
import { getIndexDbPath } from "@/harness/infra/fund_knowledge/index-db";
import { getFundKnowledgeRoot } from "@/harness/infra/fund_knowledge/paths";
import fs from "node:fs";

export function getFundKnowledgeContext() {
  const vaultRoot = ensureFundKnowledgeVault();
  return {
    vaultRoot,
    indexDbPath: getIndexDbPath(vaultRoot),
    vaultRootExists: fs.existsSync(vaultRoot),
    indexDbExists: fs.existsSync(getIndexDbPath(vaultRoot)),
  };
}

export { getFundKnowledgeRoot };
