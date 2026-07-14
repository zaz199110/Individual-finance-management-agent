import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getChunksForFile,
  getFileIndexStatus,
  indexSingleFile,
  openIndexDb,
} from "./index-db";

describe("fund knowledge index pipeline", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    tmpDirs.length = 0;
  });

  function createVault(mdBody: string): { vaultRoot: string; relPath: string; absPath: string } {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fk-vault-test-"));
    tmpDirs.push(vaultRoot);
    const fundDir = path.join(vaultRoot, "005827-Test-Fund");
    const docDir = path.join(fundDir, "quarterly_report");
    fs.mkdirSync(docDir, { recursive: true });
    const relPath = "005827-Test-Fund/quarterly_report/new-upload.md";
    const absPath = path.join(vaultRoot, relPath);
    fs.writeFileSync(absPath, mdBody, "utf8");
    return { vaultRoot, relPath, absPath };
  }

  const sampleMd = [
    "---",
    'fund_code: "005827"',
    'doc_type: quarterly_report',
    "---",
    "",
    "# 测试季报",
    "",
    "## 三、行业分布（前五）",
    "",
    "| 行业 | 占比 |",
    "| 信息技术 | 32.5% |",
    "",
    "## 四、汇率影响说明",
    "汇率波动说明。",
  ].join("\n");

  it("indexes newly uploaded md with heading aligned to chunk content", () => {
    const { vaultRoot, relPath } = createVault(sampleMd);

    const result = indexSingleFile({
      vaultRoot,
      relativePath: relPath,
      logType: "upload",
      fund_code: "005827",
    });

    expect(result.skipped).toBe(false);
    expect(result.chunk_count).toBeGreaterThan(2);

    const chunks = getChunksForFile(vaultRoot, relPath);
    const industry = chunks.find((c) => c.heading.includes("行业分布"));
    expect(industry).toBeDefined();
    expect(industry!.content.startsWith("## 三、行业分布")).toBe(true);
    expect(industry!.content).not.toContain("## 四、汇率");
    expect(getFileIndexStatus(vaultRoot, relPath)).toBe("synced");
  });

  it("reindexes when chunk metadata is stale even if file hash unchanged", () => {
    const { vaultRoot, relPath } = createVault(sampleMd);

    indexSingleFile({ vaultRoot, relativePath: relPath, logType: "upload" });
    const db = openIndexDb(vaultRoot);
    db.prepare(
      "UPDATE knowledge_chunks SET line_start = line_start + 1 WHERE file_path = ?",
    ).run(relPath);

    expect(getFileIndexStatus(vaultRoot, relPath)).toBe("pending_refresh");

    const reindex = indexSingleFile({
      vaultRoot,
      relativePath: relPath,
      logType: "refresh_reindex",
    });
    expect(reindex.skipped).toBe(false);

    const industry = getChunksForFile(vaultRoot, relPath).find((c) =>
      c.heading.includes("行业分布"),
    );
    expect(industry!.content.startsWith("## 三、行业分布")).toBe(true);
    expect(getFileIndexStatus(vaultRoot, relPath)).toBe("synced");
  });
});
