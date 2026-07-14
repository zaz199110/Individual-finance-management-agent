import type { MermaidVerifyResult } from "./mermaid-mmdc.server";

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/gi;

export type { MermaidVerifyResult };

export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MERMAID_FENCE_RE.source, "gi");
  while ((match = re.exec(markdown)) !== null) {
    const body = match[1]?.trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

export function verifyMermaidInMarkdown(markdown: string): MermaidVerifyResult {
  const blocks = extractMermaidBlocks(markdown);
  if (!blocks.length) {
    return { ok: true, block_count: 0, errors: [] };
  }
  if (process.env.HARNESS_SKIP_MMDC === "1") {
    return { ok: true, block_count: blocks.length, errors: [], skipped: true };
  }
  // Lazy load — avoid pulling child_process into instrumentation / client bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { verifyMermaidBlocks } = require("./mermaid-mmdc.server") as typeof import("./mermaid-mmdc.server");
  return verifyMermaidBlocks(blocks);
}

export function assertPublishableMarkdown(markdown: string): {
  ok: boolean;
  error?: string;
} {
  const result = verifyMermaidInMarkdown(markdown);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: `图表格式有误，无法发布：${result.errors.join("；")}`,
  };
}
