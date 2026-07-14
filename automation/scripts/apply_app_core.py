#!/usr/bin/env python3
"""Apply supabase/migrations/*.sql via DATABASE_URL (sorted filename order)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"

# 须与 docs/CODING-BOOTSTRAP.md §6.3 一致（006 在 004 之前；007 在 004/005 之后）
MIGRATION_ORDER = [
    "000_app_core.sql",
    "001_fund_watchlist.sql",
    "002_fund_semantic_entries.sql",
    "003_match_semantic_rpc.sql",
    "008_scheduled_and_trading_calendar.sql",
    "006_holdings_versions.sql",
    "004_profile_core.sql",
    "005_allocation_plans.sql",
    "007_report_index.sql",
    "009_schema_comments.sql",
    "010_public_anon_grants.sql",
    "011_service_role_grants.sql",
    "012_l0_sync_log.sql",
    "013_allocation_citations.sql",
]


def load_env() -> None:
    for name in (".env.local",):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip()
            if key and val and key not in os.environ:
                os.environ[key] = val
        break


def main() -> int:
    load_env()
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("[FAIL] DATABASE_URL missing in .env.local")
        return 1
    if not MIGRATIONS_DIR.exists():
        print(f"[FAIL] {MIGRATIONS_DIR} not found")
        return 1

    sql_files: list[Path] = []
    for name in MIGRATION_ORDER:
        path = MIGRATIONS_DIR / name
        if not path.exists():
            print(f"[FAIL] missing migration {name}")
            return 1
        sql_files.append(path)

    extra = sorted(
        p.name
        for p in MIGRATIONS_DIR.glob("*.sql")
        if p.name not in MIGRATION_ORDER
    )
    if extra:
        print(f"[WARN] unlisted migrations (skipped): {', '.join(extra)}")

    try:
        import psycopg
    except ImportError as exc:
        print(f"[FAIL] cannot import psycopg ({exc})")
        print(f"       python: {sys.executable}")
        print('       fix: python -m pip install "psycopg[binary]"')
        return 1

    with psycopg.connect(db_url, connect_timeout=30) as conn:
        for sql_file in sql_files:
            sql = sql_file.read_text(encoding="utf-8")
            conn.execute(sql)
            conn.commit()
            print(f"[OK] applied {sql_file.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
