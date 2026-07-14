import path from "node:path";
import { getRunsDir } from "@/lib/paths";
import { DRAFT_REPORT_FILENAME } from "@/lib/reports/draft-path";

/** 草稿 md 须位于本对话 run 工作区内，防路径穿越 */
export function isDraftPathInConversation(
  conversationId: string,
  draftPath: string,
): boolean {
  const runsRoot = path.resolve(getRunsDir(), conversationId);
  const resolved = path.resolve(draftPath);
  if (!resolved.startsWith(runsRoot + path.sep) && resolved !== runsRoot) {
    return false;
  }
  return path.basename(resolved) === DRAFT_REPORT_FILENAME;
}
