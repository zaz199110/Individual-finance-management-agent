import "server-only";
import fs from "node:fs";

export function validateDraftFileForPublish(sourcePath: string): {
  ok: boolean;
  error?: string;
} {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { ok: false, error: "找不到报告草稿文件。" };
  }
  const markdown = fs.readFileSync(sourcePath, "utf8");
  // Lazy import keeps mermaid / child_process off static module graph.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { assertPublishableMarkdown } = require("./mermaid-verify") as typeof import("./mermaid-verify");
  return assertPublishableMarkdown(markdown);
}
