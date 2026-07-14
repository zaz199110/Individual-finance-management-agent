import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface MermaidVerifyResult {
  ok: boolean;
  block_count: number;
  errors: string[];
  skipped?: boolean;
}

/** MERMAID-01 · publish 前 mmdc 校验（无块则跳过） */
export function verifyMermaidBlocks(blocks: string[]): MermaidVerifyResult {
  if (!blocks.length) {
    return { ok: true, block_count: 0, errors: [] };
  }

  if (process.env.HARNESS_SKIP_MMDC === "1") {
    return { ok: true, block_count: blocks.length, errors: [], skipped: true };
  }

  const errors: string[] = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmdc-"));

  try {
    blocks.forEach((block, i) => {
      const inputPath = path.join(tmpDir, `block-${i}.mmd`);
      const outputPath = path.join(tmpDir, `block-${i}.svg`);
      fs.writeFileSync(inputPath, block, "utf8");

      const result = spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["mmdc", "-i", inputPath, "-o", outputPath],
        {
          encoding: "utf8",
          timeout: 60_000,
          windowsHide: true,
        },
      );

      if (result.status !== 0) {
        const msg = (result.stderr || result.stdout || "mmdc 失败").trim();
        errors.push(`Mermaid 块 ${i + 1}：${msg.slice(0, 240)}`);
      }
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
  }

  return {
    ok: errors.length === 0,
    block_count: blocks.length,
    errors,
  };
}
