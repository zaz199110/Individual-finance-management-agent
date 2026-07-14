#!/usr/bin/env python3
"""应用 fund_watchlist.sql（幂等：仅空表 INSERT）。"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from lib.common import SEED_ROOT, load_secrets_env

SQL_PATH = SEED_ROOT / "fund_watchlist.sql"


def dry_run_report() -> None:
    print("--- fund_watchlist seed (dry-run) ---")
    print(SQL_PATH.read_text(encoding="utf-8"))
    print("预期：空表时插入 000198 等六行（纯货币/指数/债/股票/商品/QDII 各一）")


def apply(database_url: str) -> int:
    import psycopg

    sql = SQL_PATH.read_text(encoding="utf-8")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM fund_watchlist")
            before = cur.fetchone()[0]
            cur.execute(sql)
            cur.execute("SELECT COUNT(*) FROM fund_watchlist")
            after = cur.fetchone()[0]
        conn.commit()

    print(f"fund_watchlist: {before} -> {after} rows")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="应用自选 seed")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()

    load_secrets_env()
    database_url = args.database_url or os.environ.get("DATABASE_URL")

    if args.dry_run or not database_url:
        dry_run_report()
        if not database_url:
            print("[INFO] 未设置 DATABASE_URL，仅 dry-run")
        return 0

    return apply(database_url)


if __name__ == "__main__":
    raise SystemExit(main())
