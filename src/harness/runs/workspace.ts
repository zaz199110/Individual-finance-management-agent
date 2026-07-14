import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getRunsDir } from "@/lib/paths";

export function createRunId(): string {
  return uuidv4().replace(/-/g, "").slice(0, 16);
}

export function getRunWorkspacePath(
  conversationId: string,
  runId: string,
): string {
  return path.join(getRunsDir(), conversationId, runId);
}

export function ensureRunWorkspace(
  conversationId: string,
  runId: string,
): string {
  const runDir = getRunWorkspacePath(conversationId, runId);
  fs.mkdirSync(path.join(runDir, "tool-results"), { recursive: true });
  fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
  return runDir;
}
