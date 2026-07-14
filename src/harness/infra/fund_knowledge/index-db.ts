import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertChunkLineAlignment, chunkMarkdownFile, type KnowledgeChunk } from "./chunk";
import { ALL_DOC_TYPES } from "./doc-types";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundCodeFromVaultRelPath,
} from "@/lib/fund-knowledge/vault-dir";

export type IndexStatus = "synced" | "pending_refresh" | "index_failed";

export interface IndexRebuildResult {
  scanned: number;
  rebuilt: number;
  skipped: number;
  duration_ms: number;
  errors: string[];
}

export interface MaintenanceLogItem {
  id: number;
  type: string;
  fund_code: string | null;
  file_path: string | null;
  doc_type: string | null;
  status: string;
  chunk_count: number | null;
  chunk_ids: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

let indexBusy: { scope: "all" | "fund"; fund_code?: string } | null = null;
const failedFiles = new Map<string, string>();

export function getIndexDbPath(vaultRoot: string): string {
  return path.join(vaultRoot, "index.db");
}

export function sha256Content(text: string): string {
  return `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

export function hashFile(absPath: string): string {
  const text = fs.readFileSync(absPath, "utf8");
  return sha256Content(text);
}

export function isIndexBusy(fundCode?: string): boolean {
  if (!indexBusy) return false;
  if (indexBusy.scope === "all") return true;
  return fundCode === indexBusy.fund_code;
}

export function getIndexBusyState(): typeof indexBusy {
  return indexBusy;
}

function utcNowIso(): string {
  return new Date().toISOString();
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      fund_code TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      heading TEXT NOT NULL,
      heading_level INTEGER NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      file_content_hash TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      fund_code UNINDEXED,
      doc_type UNINDEXED,
      heading,
      content,
      tokenize = 'unicode61'
    );

    CREATE TABLE IF NOT EXISTS maintenance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      fund_code TEXT,
      file_path TEXT,
      doc_type TEXT,
      status TEXT NOT NULL,
      chunk_count INTEGER,
      chunk_ids TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON knowledge_chunks(file_path);
    CREATE INDEX IF NOT EXISTS idx_chunks_fund ON knowledge_chunks(fund_code);
  `);
}

export function openIndexDb(vaultRoot: string): DatabaseSync {
  fs.mkdirSync(vaultRoot, { recursive: true });
  const db = new DatabaseSync(getIndexDbPath(vaultRoot));
  db.exec("PRAGMA journal_mode=WAL");
  ensureSchema(db);
  return db;
}

function iterMdFiles(vaultRoot: string, fundCode?: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(vaultRoot)) return files;

  for (const entry of fs.readdirSync(vaultRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isVaultFundDir(entry.name)) continue;
    const code = parseFundCodeFromVaultDir(entry.name)!;
    if (fundCode && code !== fundCode) continue;
    walkMd(path.join(vaultRoot, entry.name), vaultRoot, files);
  }
  return files.sort();
}

function walkMd(dir: string, vaultRoot: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "raw") continue;
      walkMd(full, vaultRoot, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
}

function getIndexedHash(db: DatabaseSync, filePath: string): string | null {
  const row = db
    .prepare(
      "SELECT file_content_hash FROM knowledge_chunks WHERE file_path = ? LIMIT 1",
    )
    .get(filePath) as { file_content_hash: string } | undefined;
  return row?.file_content_hash ?? null;
}

function deleteFileChunks(db: DatabaseSync, filePath: string): void {
  const ids = db
    .prepare("SELECT chunk_id FROM knowledge_chunks WHERE file_path = ?")
    .all(filePath) as Array<{ chunk_id: string }>;
  for (const { chunk_id } of ids) {
    db.prepare("DELETE FROM knowledge_chunks_fts WHERE chunk_id = ?").run(chunk_id);
    db.prepare("DELETE FROM knowledge_chunks WHERE chunk_id = ?").run(chunk_id);
  }
}

function indexOneFile(
  db: DatabaseSync,
  vaultRoot: string,
  absPath: string,
): { chunk_count: number; chunk_ids: string[]; hash: string } {
  const rel = path.relative(vaultRoot, absPath).replace(/\\/g, "/");
  const fundCode = parseFundCodeFromVaultRelPath(rel);
  const docType = rel.split("/").length > 2 ? rel.split("/")[1]! : "other";
  const text = fs.readFileSync(absPath, "utf8");
  const hash = sha256Content(text);
  const indexedAt = utcNowIso();

  deleteFileChunks(db, rel);
  const chunks = chunkMarkdownFile({
    fundCode,
    docType,
    filePath: rel,
    absolutePath: absPath,
  });
  assertChunkLineAlignment(chunks, absPath);

  const insertChunk = db.prepare(`
    INSERT INTO knowledge_chunks
    (chunk_id, fund_code, doc_type, file_path, heading, heading_level,
     line_start, line_end, file_content_hash, indexed_at, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO knowledge_chunks_fts (chunk_id, fund_code, doc_type, heading, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  const chunkIds: string[] = [];
  for (const c of chunks) {
    insertChunk.run(
      c.chunk_id,
      c.fund_code,
      c.doc_type,
      c.file_path,
      c.heading,
      c.heading_level,
      c.line_start,
      c.line_end,
      hash,
      indexedAt,
      c.content,
    );
    insertFts.run(c.chunk_id, c.fund_code, c.doc_type, c.heading, c.content);
    chunkIds.push(c.chunk_id);
  }

  failedFiles.delete(rel);
  return { chunk_count: chunks.length, chunk_ids: chunkIds, hash };
}

export function appendMaintenanceLog(
  db: DatabaseSync,
  entry: Omit<MaintenanceLogItem, "id">,
): number {
  const result = db
    .prepare(
      `INSERT INTO maintenance_log
       (type, fund_code, file_path, doc_type, status, chunk_count, chunk_ids, error_message, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.type,
      entry.fund_code,
      entry.file_path,
      entry.doc_type,
      entry.status,
      entry.chunk_count,
      entry.chunk_ids,
      entry.error_message,
      entry.duration_ms,
      entry.created_at,
    );
  return Number(result.lastInsertRowid);
}

function areIndexedChunksCurrent(
  db: DatabaseSync,
  rel: string,
  expected: KnowledgeChunk[],
): boolean {
  const rows = db
    .prepare(
      `SELECT line_start, line_end, content
       FROM knowledge_chunks WHERE file_path = ? ORDER BY line_start`,
    )
    .all(rel) as Array<{ line_start: number; line_end: number; content: string }>;
  if (rows.length !== expected.length) return false;
  return expected.every(
    (chunk, i) =>
      chunk.line_start === rows[i]!.line_start &&
      chunk.line_end === rows[i]!.line_end &&
      chunk.content === rows[i]!.content,
  );
}

function getExpectedChunksForFile(absPath: string, rel: string): KnowledgeChunk[] {
  const relParts = rel.split("/");
  const docType = relParts.length > 2 ? relParts[1]! : "other";
  const fundCode = parseFundCodeFromVaultRelPath(relParts.join("/"));
  return chunkMarkdownFile({
    fundCode,
    docType,
    filePath: rel,
    absolutePath: absPath,
  });
}

function needsFileReindex(db: DatabaseSync, rel: string, absPath: string): boolean {
  const indexedHash = getIndexedHash(db, rel);
  if (!indexedHash) return true;
  if (indexedHash !== hashFile(absPath)) return true;
  return !areIndexedChunksCurrent(db, rel, getExpectedChunksForFile(absPath, rel));
}

export function rebuildIndex(input: {
  vaultRoot: string;
  scope: "all" | "fund";
  fund_code?: string;
  logType?: "manual_reindex" | "refresh_reindex" | "upload" | "chunk_delete";
}): IndexRebuildResult {
  if (indexBusy) {
    throw new Error("ERR-FK-INDEX-BUSY");
  }

  const scopeFund =
    input.scope === "fund" ? String(input.fund_code ?? "").trim() : undefined;
  if (input.scope === "fund" && !/^\d{6}$/.test(scopeFund ?? "")) {
    throw new Error("ERR-FK-UPLOAD-INVALID");
  }

  indexBusy = { scope: input.scope, fund_code: scopeFund };
  const started = Date.now();
  const errors: string[] = [];
  let scanned = 0;
  let rebuilt = 0;
  let skipped = 0;

  try {
    const db = openIndexDb(input.vaultRoot);
    const mdFiles = iterMdFiles(input.vaultRoot, scopeFund);

    for (const absPath of mdFiles) {
      scanned += 1;
      const rel = path.relative(input.vaultRoot, absPath).replace(/\\/g, "/");
      try {
        if (!needsFileReindex(db, rel, absPath)) {
          skipped += 1;
          continue;
        }
        indexOneFile(db, input.vaultRoot, absPath);
        rebuilt += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${rel}: ${msg}`);
        failedFiles.set(rel, msg);
      }
    }

    const indexedPaths = db
      .prepare("SELECT DISTINCT file_path FROM knowledge_chunks")
      .all() as Array<{ file_path: string }>;
    for (const { file_path } of indexedPaths) {
      const abs = path.join(input.vaultRoot, file_path);
      if (!fs.existsSync(abs)) {
        deleteFileChunks(db, file_path);
        rebuilt += 1;
      }
    }

    const summaryDetail = `扫描 ${scanned} 个文件，重建 ${rebuilt} 个，跳过 ${skipped} 个`;
    appendMaintenanceLog(db, {
      type: input.logType ?? "manual_reindex",
      fund_code: scopeFund ?? null,
      file_path: null,
      doc_type: null,
      status: errors.length ? (rebuilt ? "partial" : "failed") : "success",
      chunk_count: countChunks(db, scopeFund),
      chunk_ids: null,
      error_message: errors.length
        ? `${summaryDetail}；${errors.join("; ")}`
        : summaryDetail,
      duration_ms: Date.now() - started,
      created_at: utcNowIso(),
    });
  } finally {
    indexBusy = null;
  }

  return {
    scanned,
    rebuilt,
    skipped,
    duration_ms: Date.now() - started,
    errors,
  };
}

export function indexSingleFile(input: {
  vaultRoot: string;
  relativePath: string;
  logType?: "upload" | "refresh_reindex" | "chunk_delete";
  fund_code?: string;
}): { chunk_count: number; chunk_ids: string[]; hash: string; skipped: boolean } {
  if (isIndexBusy(input.fund_code)) {
    throw new Error("ERR-FK-INDEX-BUSY");
  }

  const abs = path.join(input.vaultRoot, input.relativePath.replace(/\\/g, "/"));
  if (!fs.existsSync(abs)) {
    throw new Error("ERR-FK-FILE-NOT-FOUND");
  }

  const db = openIndexDb(input.vaultRoot);
  if (!needsFileReindex(db, input.relativePath.replace(/\\/g, "/"), abs)) {
    return { chunk_count: 0, chunk_ids: [], hash: hashFile(abs), skipped: true };
  }

  const started = Date.now();
  try {
    const result = indexOneFile(db, input.vaultRoot, abs);
    appendMaintenanceLog(db, {
      type: input.logType ?? "refresh_reindex",
      fund_code: input.fund_code ?? parseFundCodeFromVaultRelPath(input.relativePath),
      file_path: input.relativePath,
      doc_type: input.relativePath.split("/")[1] ?? null,
      status: "success",
      chunk_count: result.chunk_count,
      chunk_ids: JSON.stringify(result.chunk_ids),
      error_message: null,
      duration_ms: Date.now() - started,
      created_at: utcNowIso(),
    });
    return { ...result, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failedFiles.set(input.relativePath, msg);
    appendMaintenanceLog(db, {
      type: input.logType ?? "refresh_reindex",
      fund_code: input.fund_code ?? null,
      file_path: input.relativePath,
      doc_type: null,
      status: "failed",
      chunk_count: null,
      chunk_ids: null,
      error_message: msg,
      duration_ms: Date.now() - started,
      created_at: utcNowIso(),
    });
    throw e;
  }
}

function countChunks(db: DatabaseSync, fundCode?: string): number {
  if (fundCode) {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE fund_code = ?")
      .get(fundCode) as { n: number };
    return row.n;
  }
  const row = db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks").get() as {
    n: number;
  };
  return row.n;
}

export function getFileIndexStatus(
  vaultRoot: string,
  relativePath: string,
): IndexStatus {
  if (failedFiles.has(relativePath)) return "index_failed";
  const abs = path.join(vaultRoot, relativePath);
  if (!fs.existsSync(abs)) return "pending_refresh";

  try {
    hashFile(abs);
  } catch {
    return "index_failed";
  }

  const dbPath = getIndexDbPath(vaultRoot);
  if (!fs.existsSync(dbPath)) return "pending_refresh";

  const db = openIndexDb(vaultRoot);
  if (needsFileReindex(db, relativePath, abs)) return "pending_refresh";
  return "synced";
}

/** Remove md files from vault and purge their chunks from index.db. */
export function deleteVaultMdFiles(input: {
  vaultRoot: string;
  relativePaths: string[];
}): { deleted_paths: string[] } {
  const db = openIndexDb(input.vaultRoot);
  const deleted: string[] = [];
  for (const rel of input.relativePaths) {
    const safe = rel.replace(/\\/g, "/");
    const abs = path.join(input.vaultRoot, safe);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
    deleteFileChunks(db, safe);
    failedFiles.delete(safe);
    deleted.push(safe);

    appendMaintenanceLog(db, {
      type: "document_delete",
      fund_code: parseFundCodeFromVaultRelPath(safe),
      file_path: safe,
      doc_type: safe.split("/")[1] ?? null,
      status: "success",
      chunk_count: null,
      chunk_ids: null,
      error_message: null,
      duration_ms: null,
      created_at: utcNowIso(),
    });
  }
  return { deleted_paths: deleted };
}

export function getChunksForFile(
  vaultRoot: string,
  relativePath: string,
): Array<{
  chunk_id: string;
  heading: string;
  heading_level: number;
  line_start: number;
  line_end: number;
  content: string;
}> {
  const dbPath = getIndexDbPath(vaultRoot);
  if (!fs.existsSync(dbPath)) {
    const abs = path.join(vaultRoot, relativePath);
    if (!fs.existsSync(abs)) return [];
    const fundCode = parseFundCodeFromVaultRelPath(relativePath);
    const docType = relativePath.split("/")[1] ?? "other";
    return chunkMarkdownFile({
      fundCode,
      docType,
      filePath: relativePath,
      absolutePath: abs,
    }).map((c) => ({
      chunk_id: c.chunk_id,
      heading: c.heading,
      heading_level: c.heading_level,
      line_start: c.line_start,
      line_end: c.line_end,
      content: c.content,
    }));
  }

  const db = openIndexDb(vaultRoot);
  return db
    .prepare(
      `SELECT chunk_id, heading, heading_level, line_start, line_end, content
       FROM knowledge_chunks WHERE file_path = ?
       ORDER BY line_start`,
    )
    .all(relativePath) as unknown as Array<{
    chunk_id: string;
    heading: string;
    heading_level: number;
    line_start: number;
    line_end: number;
    content: string;
  }>;
}

export interface FtsHit {
  chunk_id: string;
  fund_code: string;
  doc_type: string;
  file_path: string;
  heading: string;
  line_start: number;
  line_end: number;
  content: string;
  rank: number;
}

export function queryFts(input: {
  vaultRoot: string;
  fund_code: string;
  query: string;
  limit?: number;
}): FtsHit[] {
  const dbPath = getIndexDbPath(input.vaultRoot);
  if (!fs.existsSync(dbPath)) return [];

  const tokens = input.query
    .split(/[\s，。、；：？！,.;:!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  const db = openIndexDb(input.vaultRoot);

  try {
    const rows = db
      .prepare(
        `
        SELECT c.chunk_id, c.fund_code, c.doc_type, c.file_path, c.heading,
               c.line_start, c.line_end, c.content,
               bm25(knowledge_chunks_fts) AS rank
        FROM knowledge_chunks_fts f
        JOIN knowledge_chunks c ON c.chunk_id = f.chunk_id
        WHERE knowledge_chunks_fts MATCH ?
          AND c.fund_code = ?
        ORDER BY rank
        LIMIT ?
      `,
      )
      .all(ftsQuery, input.fund_code, input.limit ?? 8) as unknown as FtsHit[];
    return rows;
  } catch {
    return [];
  }
}

export function getIndexSummary(vaultRoot: string): {
  fund_count: number;
  file_count: number;
  chunk_count: number;
} {
  const fundDirs = fs.existsSync(vaultRoot)
    ? fs
        .readdirSync(vaultRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && isVaultFundDir(d.name))
    : [];

  const mdFiles = iterMdFiles(vaultRoot);
  const dbPath = getIndexDbPath(vaultRoot);
  let chunkCount = 0;
  if (fs.existsSync(dbPath)) {
    const db = openIndexDb(vaultRoot);
    chunkCount = countChunks(db);
  }

  return {
    fund_count: fundDirs.length,
    file_count: mdFiles.length,
    chunk_count: chunkCount,
  };
}

export function listMaintenanceLog(input: {
  vaultRoot: string;
  limit?: number;
  offset?: number;
  fund_code?: string;
  type?: string;
}): { summary: ReturnType<typeof getIndexSummary>; items: MaintenanceLogItem[]; total: number } {
  const summary = getIndexSummary(input.vaultRoot);
  const dbPath = getIndexDbPath(input.vaultRoot);
  if (!fs.existsSync(dbPath)) {
    return { summary, items: [], total: 0 };
  }

  const db = openIndexDb(input.vaultRoot);
  const limit = Math.min(input.limit ?? 50, 200);
  const offset = input.offset ?? 0;

  const conditions: string[] = [];
  const params: string[] = [];
  if (input.fund_code) {
    conditions.push("fund_code = ?");
    params.push(input.fund_code);
  }
  if (input.type) {
    conditions.push("type = ?");
    params.push(input.type);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM maintenance_log ${whereClause}`)
    .get(...params) as unknown as { n: number };
  const items = db
    .prepare(
      `SELECT id, type, fund_code, file_path, doc_type, status, chunk_count,
              chunk_ids, error_message, duration_ms, created_at
       FROM maintenance_log ${whereClause}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as MaintenanceLogItem[];

  return { summary, items, total: totalRow.n };
}

export function trimMaintenanceLog(input: {
  vaultRoot: string;
  olderThanDays?: number;
}): { deleted_count: number } {
  const dbPath = getIndexDbPath(input.vaultRoot);
  if (!fs.existsSync(dbPath)) return { deleted_count: 0 };

  const db = openIndexDb(input.vaultRoot);
  const days = input.olderThanDays ?? 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const result = db
    .prepare("DELETE FROM maintenance_log WHERE created_at < ?")
    .run(cutoff);

  return { deleted_count: result.changes as number };
}

export function ensureVaultDocTypeDirs(fundDir: string): void {
  fs.mkdirSync(fundDir, { recursive: true });
  for (const dt of ALL_DOC_TYPES) {
    fs.mkdirSync(path.join(fundDir, dt), { recursive: true });
  }
  fs.mkdirSync(path.join(fundDir, "raw"), { recursive: true });
}

export { failedFiles };
