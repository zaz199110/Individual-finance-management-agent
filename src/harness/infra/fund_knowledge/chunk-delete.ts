import fs from "node:fs";
import path from "node:path";
import { getChunksForFile, indexSingleFile } from "./index-db";

export function deleteChunksFromFile(input: {
  vaultRoot: string;
  relativePath: string;
  chunk_ids: string[];
}): {
  deleted_chunk_ids: string[];
  new_chunk_count: number;
  content_hash: string;
} {
  const abs = path.join(input.vaultRoot, input.relativePath.replace(/\\/g, "/"));
  if (!fs.existsSync(abs)) {
    throw new Error("ERR-FK-FILE-NOT-FOUND");
  }

  const chunks = getChunksForFile(input.vaultRoot, input.relativePath);
  const toDelete = chunks.filter((c) => input.chunk_ids.includes(c.chunk_id));
  if (toDelete.length !== input.chunk_ids.length) {
    throw new Error("ERR-FK-CHUNK-NOT-FOUND");
  }

  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const ranges = toDelete
    .map((c) => ({ start: c.line_start, end: c.line_end }))
    .sort((a, b) => b.start - a.start);

  for (const { start, end } of ranges) {
    lines.splice(start - 1, end - start + 1);
  }

  const updated = lines.join("\n");
  const fmMatch = updated.match(/^---\n([\s\S]*?\n)---\n/);
  if (fmMatch) {
    const body = updated.slice(fmMatch[0].length);
    const newFm = fmMatch[0].replace(
      /updated_at:.*\n/,
      `updated_at: "${new Date().toISOString()}"\n`,
    );
    fs.writeFileSync(abs, newFm + body, "utf8");
  } else {
    fs.writeFileSync(abs, updated, "utf8");
  }

  const indexResult = indexSingleFile({
    vaultRoot: input.vaultRoot,
    relativePath: input.relativePath,
    logType: "chunk_delete",
  });

  return {
    deleted_chunk_ids: input.chunk_ids,
    new_chunk_count: indexResult.chunk_count,
    content_hash: indexResult.hash,
  };
}
