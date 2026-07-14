#!/usr/bin/env python3
"""离线验收：不依赖 Supabase / 联网 embedding。"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SEED_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
MANIFEST = SEED_ROOT / "manifest.json"


def run(cmd: list[str]) -> None:
    result = subprocess.run(
        cmd,
        cwd=SCRIPTS,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise RuntimeError(f"command failed: {' '.join(cmd)}")


def test_manifest() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert data["description"].startswith("DEMO-ABCDEF")
    for code in [
        "019305", "017704", "110020", "206007", "519772", "518880",
        "110022", "217022", "000198",
    ]:
        assert code in data["funds"]
        entry = data["funds"][code]
        if entry.get("vault_dir"):
            assert entry["vault_dir"]
    assert len(data["funds"]) == 9
    assert data.get("semantic_seed_fund") == "*"
    print("[PASS] manifest.json (DEMO-ABCDEF-01)")


def test_watchlist_sql() -> None:
    sql = (SEED_ROOT / "fund_watchlist.sql").read_text(encoding="utf-8")
    assert "019305" in sql and "017704" in sql and "206007" in sql
    assert "NOT EXISTS" in sql
    print("[PASS] fund_watchlist.sql")


def test_semantic_json() -> None:
    data = json.loads((SEED_ROOT / "fund_semantic_entries.json").read_text(encoding="utf-8"))
    faq = [e for e in data["entries"] if e["entry_type"] == "faq"]
    assert data.get("fund_code") == "*"
    assert len(faq) == 100
    print(f"[PASS] fund_semantic_entries.json (faq={len(faq)}, global={data.get('fund_code')})")


def test_vault_pipeline() -> None:
    run([sys.executable, "build_vault.py"])
    demo_codes = ["019305", "017704", "110020", "206007", "519772", "518880"]
    for code in demo_codes:
        matches = list((SEED_ROOT / "fund-knowledge").glob(f"{code}-*"))
        assert matches, f"missing vault for {code}"
    assert (SEED_ROOT / "fund-knowledge" / "206007-Penghua-Consumer-Select").exists()
    print("[PASS] build_vault.py (6 demo vaults)")


def test_index() -> None:
    run([sys.executable, "build_index.py"])
    db = SEED_ROOT / "index.db"
    assert db.exists()
    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM knowledge_chunks").fetchone()[0]
    hits = conn.execute(
        """
        SELECT c.chunk_id, c.heading
        FROM knowledge_chunks_fts f
        JOIN knowledge_chunks c ON c.chunk_id = f.chunk_id
        WHERE knowledge_chunks_fts MATCH '管理费'
          AND c.fund_code = '017704'
        LIMIT 3
        """
    ).fetchall()
    conn.close()
    assert count > 0
    assert len(hits) >= 1, "017704 应能命中「管理费」"
    print(f"[PASS] build_index.py ({count} chunks, 017704 管理费 hits={len(hits)})")


def main() -> int:
    tests = [
        test_manifest,
        test_watchlist_sql,
        test_semantic_json,
        test_vault_pipeline,
        test_index,
    ]
    for fn in tests:
        fn()
    print("\n[OK] all offline seed tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
