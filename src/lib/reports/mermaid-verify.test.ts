import { describe, expect, it } from "vitest";
import {
  extractMermaidBlocks,
  verifyMermaidInMarkdown,
} from "./mermaid-verify";

describe("mermaid-verify", () => {
  it("extracts fenced mermaid blocks", () => {
    const md = "# Title\n\n```mermaid\nflowchart TB\n  A --> B\n```\n";
    expect(extractMermaidBlocks(md)).toEqual(["flowchart TB\n  A --> B"]);
  });

  it("skips verify when no mermaid blocks", () => {
    const r = verifyMermaidInMarkdown("# hello\n\nplain text");
    expect(r.ok).toBe(true);
    expect(r.block_count).toBe(0);
  });

  it("skips mmdc when HARNESS_SKIP_MMDC=1", () => {
    const prev = process.env.HARNESS_SKIP_MMDC;
    process.env.HARNESS_SKIP_MMDC = "1";
    const md = "```mermaid\nflowchart TB\n  X --> Y\n```";
    const r = verifyMermaidInMarkdown(md);
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    if (prev === undefined) delete process.env.HARNESS_SKIP_MMDC;
    else process.env.HARNESS_SKIP_MMDC = prev;
  });
});
