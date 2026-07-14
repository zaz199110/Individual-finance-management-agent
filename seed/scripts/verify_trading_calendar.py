#!/usr/bin/env python3
"""Quick check: trading_calendar 2026 in Postgres."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import load_secrets_env

load_secrets_env()
url = os.environ.get("DATABASE_URL", "")
if not url:
    print("DATABASE_URL missing")
    raise SystemExit(1)

import psycopg

with psycopg.connect(url, connect_timeout=15) as conn:
    n = conn.execute("SELECT COUNT(*) FROM trading_calendar WHERE year = 2026").fetchone()[0]
    o = conn.execute(
        "SELECT COUNT(*) FROM trading_calendar WHERE year = 2026 AND is_open = TRUE"
    ).fetchone()[0]
    row = conn.execute(
        """
        SELECT source, MIN(cal_date), MAX(cal_date)
        FROM trading_calendar WHERE year = 2026 GROUP BY source
        """
    ).fetchone()
print(f"trading_calendar 2026: {n} rows, {o} trading days")
if row:
    print(f"source={row[0]}, range={row[1]} .. {row[2]}")
