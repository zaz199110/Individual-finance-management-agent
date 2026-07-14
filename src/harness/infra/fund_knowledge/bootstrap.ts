import fs from "node:fs";
import path from "node:path";
import {
  getFundKnowledgeRoot,
  getSeedFundKnowledgeRoot,
} from "./paths";
import { isVaultFundDir, parseFundCodeFromVaultDir } from "./vault-slug";

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

/** Copy seed vault into data/fund-knowledge when runtime vault is empty; merge missing seed funds. */
export function ensureFundKnowledgeVault(): string {
  const root = getFundKnowledgeRoot();
  const seed = getSeedFundKnowledgeRoot();
  if (!fs.existsSync(seed)) {
    fs.mkdirSync(root, { recursive: true });
    return root;
  }
  const hasVault =
    fs.existsSync(root) &&
    fs.readdirSync(root).some((n) => isVaultFundDir(n));
  if (!hasVault) {
    fs.mkdirSync(root, { recursive: true });
    copyDir(seed, root);
  } else {
    syncMissingSeedFunds();
  }
  return root;
}

function syncMissingSeedFunds(): number {
  const root = getFundKnowledgeRoot();
  const seed = getSeedFundKnowledgeRoot();
  if (!fs.existsSync(seed)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(seed, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isVaultFundDir(entry.name)) continue;
    const code = parseFundCodeFromVaultDir(entry.name);
    if (!code) continue;
    const dest = path.join(root, entry.name);
    if (!fs.existsSync(dest)) {
      copyDir(path.join(seed, entry.name), dest);
      copied += 1;
      continue;
    }
    copied += copyDirMerge(path.join(seed, entry.name), dest);
  }
  return copied;
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
