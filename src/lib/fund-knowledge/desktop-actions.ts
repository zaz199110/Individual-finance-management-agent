import fs from "node:fs";
import path from "node:path";
import { resolveVaultFilePath } from "@/harness/infra/fund_knowledge/path-security";
import {
  isDesktopShellAvailable,
  openLocalPath,
  openLocalTextFile,
} from "@/lib/desktop/open-local-path";
import { getFundKnowledgeContext } from "./context";

function desktopUnavailable(): never {
  const err = new Error("ERR-DESKTOP-UNAVAILABLE") as Error & { code: string };
  err.code = "ERR-DESKTOP-UNAVAILABLE";
  throw err;
}

function openFailed(message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = "ERR-DESKTOP-OPEN-FAILED";
  throw err;
}

export async function openFundKnowledgeFolder(input: {
  target: "vault_root" | "fund";
  fund_code?: string;
}): Promise<{ opened_path: string }> {
  if (!isDesktopShellAvailable()) desktopUnavailable();

  const { vaultRoot } = getFundKnowledgeContext();
  let dir = vaultRoot;

  if (input.target === "fund") {
    const code = input.fund_code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      const err = new Error("ERR-FK-PATH-INVALID") as Error & { code: string };
      err.code = "ERR-FK-PATH-INVALID";
      throw err;
    }
    const entries = fs.existsSync(vaultRoot)
      ? fs.readdirSync(vaultRoot, { withFileTypes: true })
      : [];
    const match = entries.find(
      (e) => e.isDirectory() && e.name.startsWith(`${code}-`),
    );
    if (!match) {
      const err = new Error("ERR-FK-FILE-NOT-FOUND") as Error & { code: string };
      err.code = "ERR-FK-FILE-NOT-FOUND";
      throw err;
    }
    dir = path.join(vaultRoot, match.name);
  }

  fs.mkdirSync(dir, { recursive: true });
  try {
    await openLocalPath(dir);
  } catch (e) {
    openFailed(e instanceof Error ? e.message : "open failed");
  }
  return { opened_path: dir };
}

export async function openFundKnowledgeFile(relPath: string): Promise<{ opened_path: string }> {
  if (!isDesktopShellAvailable()) desktopUnavailable();

  const { vaultRoot } = getFundKnowledgeContext();
  let abs: string;
  try {
    abs = resolveVaultFilePath(vaultRoot, relPath);
  } catch {
    const err = new Error("ERR-FK-PATH-INVALID") as Error & { code: string };
    err.code = "ERR-FK-PATH-INVALID";
    throw err;
  }

  if (!fs.existsSync(abs)) {
    const err = new Error("ERR-FK-FILE-NOT-FOUND") as Error & { code: string };
    err.code = "ERR-FK-FILE-NOT-FOUND";
    throw err;
  }

  try {
    await openLocalTextFile(abs);
  } catch (e) {
    openFailed(e instanceof Error ? e.message : "open failed");
  }
  return { opened_path: abs };
}
