#!/usr/bin/env python3
"""构建 FTS5 块索引 index.db（对标 §3.5.5 knowledge_chunks）。"""
from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path

from lib.common import (
    DEFAULT_APP_ROOT,
    SEED_ROOT,
    load_manifest,
    parse_frontmatter,
    sha256_text,
    slugify_chunk_id,
    utc_now_iso,
)

HEADING_RE = re.compile(r"^(#{2,3})\s+(.+)$")


def iter_md_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root)
        if rel.parts[0] == "raw":
            continue
        files.append(path)
    return files


def chunk_markdown(text: str) -> list[dict]:
    meta, body = parse_frontmatter(text)
    lines = body.splitlines()
    chunks: list[dict] = []
    current_heading = "frontmatter" if meta else "正文"
    current_level = 0
    start_line = 1
    buffer: list[str] = []

    def flush(end_line: int) -> None:
        nonlocal buffer, start_line, current_heading, current_level
        content = "\n".join(buffer).strip()
        if not content and current_heading != "frontmatter":
            buffer = []
            return
        chunks.append(
            {
                "heading": current_heading,
                "heading_level": current_level,
                "line_start": start_line,
                "line_end": end_line,
                "content": content if content else "\n".join(buffer),
            }
        )
        buffer = []

    if meta:
        meta_text = "\n".join(f"{k}: {v}" for k, v in meta.items())
        chunks.append(
            {
                "heading": "frontmatter",
                "heading_level": 0,
                "line_start": 1,
                "line_end": 1,
                "content": meta_text,
            }
        )

    for idx, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line)
        if m:
            if buffer:
                flush(idx - 1)
            current_level = len(m.group(1))
            current_heading = m.group(2).strip()
            start_line = idx
            buffer = [line]
        else:
            if not buffer:
                start_line = idx
            buffer.append(line)

    if buffer:
        flush(len(lines) + (2 if meta else 0))

    return chunks


def build_index(vault_root: Path, db_path: Path) -> dict[str, int]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE knowledge_chunks (
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

        CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
          chunk_id UNINDEXED,
          fund_code UNINDEXED,
          doc_type UNINDEXED,
          heading,
          content,
          tokenize = 'unicode61'
        );
        """
    )

    stats = {"files": 0, "chunks": 0}
    indexed_at = utc_now_iso()

    for md_path in iter_md_files(vault_root):
        rel = md_path.relative_to(vault_root)
        fund_code = rel.parts[0].split("-", 1)[0]
        doc_type = rel.parts[1] if len(rel.parts) > 2 else "other"
        text = md_path.read_text(encoding="utf-8")
        file_hash = sha256_text(text)
        # 相对 data/fund-knowledge/（§3.5.5）
        file_path = str(rel).replace("\\", "/")

        for seq, chunk in enumerate(chunk_markdown(text)):
            chunk_id = slugify_chunk_id(fund_code, file_hash, chunk["line_start"], seq)
            conn.execute(
                """
                INSERT INTO knowledge_chunks
                (chunk_id, fund_code, doc_type, file_path, heading, heading_level,
                 line_start, line_end, file_content_hash, indexed_at, content)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    fund_code,
                    doc_type,
                    file_path,
                    chunk["heading"],
                    chunk["heading_level"],
                    chunk["line_start"],
                    chunk["line_end"],
                    file_hash,
                    indexed_at,
                    chunk["content"],
                ),
            )
            conn.execute(
                """
                INSERT INTO knowledge_chunks_fts (chunk_id, fund_code, doc_type, heading, content)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    fund_code,
                    doc_type,
                    chunk["heading"],
                    chunk["content"],
                ),
            )
            stats["chunks"] += 1

        stats["files"] += 1
        print(f"[OK] indexed {file_path} ({stats['chunks']} chunks total)")

    conn.commit()
    conn.close()
    return stats


def explore(db_path: Path, fund_code: str, query: str, limit: int = 5) -> list[tuple]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        """
        SELECT c.chunk_id, c.file_path, c.heading, c.line_start, c.line_end,
               snippet(knowledge_chunks_fts, 4, '[', ']', '…', 20) AS snip
        FROM knowledge_chunks_fts f
        JOIN knowledge_chunks c ON c.chunk_id = f.chunk_id
        WHERE knowledge_chunks_fts MATCH ?
          AND c.fund_code = ?
        LIMIT ?
        """,
        (query, fund_code, limit),
    ).fetchall()
    conn.close()
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="构建 fund-knowledge FTS 索引")
    parser.add_argument("--app-root", type=Path, default=DEFAULT_APP_ROOT)
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=None,
        help="默认 seed/fund-knowledge；--sync 时用 app-root/data/fund-knowledge",
    )
    parser.add_argument("--explore", action="store_true", help="建索引后试检索")
    parser.add_argument("--fund", default="019305")
    parser.add_argument("--query", default="管理费")
    args = parser.parse_args()

    vault_root = args.vault_root or (SEED_ROOT / "fund-knowledge")
    db_path = vault_root.parent / "index.db"
    if args.vault_root is None and (args.app_root / "data" / "fund-knowledge").exists():
        vault_root = args.app_root / "data" / "fund-knowledge"
        db_path = args.app_root / "data" / "fund-knowledge" / "index.db"

    if not vault_root.exists():
        print(f"[FAIL] vault 不存在: {vault_root}")
        return 1

    stats = build_index(vault_root, db_path)
    print(f"index.db: {stats['files']} files, {stats['chunks']} chunks -> {db_path}")

    if args.explore:
        for row in explore(db_path, args.fund, args.query):
            print("HIT", row[0], row[2], f"L{row[3]}-{row[4]}", row[5][:80])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
