#!/usr/bin/env python3
"""从 Tushare（失败则 AKShare）拉取交易日历，生成 seed SQL 并可选写入 Postgres。"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

SEED_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.common import load_secrets_env  # noqa: E402

DEFAULT_YEAR = 2026
EXCHANGE = "SSE"


def fetch_tushare(year: int, token: str) -> list[tuple[str, bool]]:
    import tushare as ts

    pro = ts.pro_api(token)
    start = f"{year}0101"
    end = f"{year}1231"
    df = pro.trade_cal(exchange=EXCHANGE, start_date=start, end_date=end)
    if df is None or df.empty:
        raise RuntimeError("Tushare trade_cal 返回空数据")
    rows: list[tuple[str, bool]] = []
    for _, row in df.iterrows():
        cal_date = str(row["cal_date"])
        iso = f"{cal_date[:4]}-{cal_date[4:6]}-{cal_date[6:8]}"
        is_open = str(row["is_open"]) == "1"
        rows.append((iso, is_open))
    rows.sort(key=lambda x: x[0])
    return rows


def fetch_akshare(year: int) -> list[tuple[str, bool]]:
    import akshare as ak

    df = ak.tool_trade_date_hist_sina()
    if df is None or df.empty:
        raise RuntimeError("AKShare 交易日历返回空数据")
    col = "trade_date" if "trade_date" in df.columns else df.columns[0]
    open_dates = set()
    for val in df[col].astype(str):
        s = val.replace("-", "")
        if len(s) == 8:
            open_dates.add(f"{s[:4]}-{s[4:6]}-{s[6:8]}")
    rows: list[tuple[str, bool]] = []
    for month in range(1, 13):
        import calendar

        _, last_day = calendar.monthrange(year, month)
        for day in range(1, last_day + 1):
            iso = f"{year:04d}-{month:02d}-{day:02d}"
            rows.append((iso, iso in open_dates))
    return rows


def build_sql(rows: list[tuple[str, bool]], year: int, source: str) -> str:
    lines = [
        f"-- trading_calendar {year} · source={source} · generated {datetime.now(timezone.utc).isoformat()}",
        "INSERT INTO trading_calendar (cal_date, exchange, is_open, year, source, fetched_at)",
        "VALUES",
    ]
    value_lines = []
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")
    for cal_date, is_open in rows:
        value_lines.append(
            f"  ('{cal_date}', '{EXCHANGE}', {'TRUE' if is_open else 'FALSE'}, {year}, '{source}', '{fetched_at}')"
        )
    lines.append(",\n".join(value_lines))
    lines.append("ON CONFLICT (cal_date, exchange) DO UPDATE SET")
    lines.append("  is_open = EXCLUDED.is_open,")
    lines.append("  year = EXCLUDED.year,")
    lines.append("  source = EXCLUDED.source,")
    lines.append("  fetched_at = EXCLUDED.fetched_at;")
    return "\n".join(lines) + "\n"


def apply_to_db(database_url: str, sql: str) -> None:
    import psycopg

    with psycopg.connect(database_url, connect_timeout=30) as conn:
        conn.execute(sql)
        count = conn.execute(
            "SELECT COUNT(*) FROM trading_calendar WHERE year = %s",
            (DEFAULT_YEAR,),
        ).fetchone()[0]
        open_count = conn.execute(
            "SELECT COUNT(*) FROM trading_calendar WHERE year = %s AND is_open = TRUE",
            (DEFAULT_YEAR,),
        ).fetchone()[0]
        conn.commit()
    print(f"[OK] trading_calendar {DEFAULT_YEAR}: {count} rows ({open_count} trading days)")


def main() -> int:
    parser = argparse.ArgumentParser(description="拉取并 seed 交易日历")
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR)
    parser.add_argument("--apply", action="store_true", help="写入 DATABASE_URL")
    parser.add_argument("--apply-migrations", action="store_true", help="先执行 003 migration")
    args = parser.parse_args()

    load_secrets_env()
    token = os.environ.get("TUSHARE_TOKEN", "")

    rows: list[tuple[str, bool]]
    source = "tushare"
    try:
        if not token or token.startswith("your-"):
            raise RuntimeError("TUSHARE_TOKEN 未配置或为占位符")
        print(f"Fetching {args.year} from Tushare …")
        rows = fetch_tushare(args.year, token)
        print(f"[OK] Tushare: {len(rows)} calendar days")
    except Exception as exc:
        print(f"[WARN] Tushare failed: {exc}")
        print(f"Trying AKShare for {args.year} …")
        rows = fetch_akshare(args.year)
        source = "akshare"
        print(f"[OK] AKShare: {len(rows)} calendar days")

    out_path = SEED_ROOT / f"trading_calendar_{args.year}.sql"
    sql = build_sql(rows, args.year, source)
    out_path.write_text(sql, encoding="utf-8")
    print(f"[OK] wrote {out_path}")

    open_days = sum(1 for _, o in rows if o)
    print(f"Summary: {open_days} trading days / {len(rows)} calendar days in {args.year}")

    if args.apply or args.apply_migrations:
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            print("[FAIL] DATABASE_URL not set")
            return 1
        if args.apply_migrations:
            mig = SEED_ROOT / "migrations" / "003_scheduled_and_trading_calendar.sql"
            import psycopg

            with psycopg.connect(db_url, connect_timeout=30) as conn:
                conn.execute(mig.read_text(encoding="utf-8"))
                conn.commit()
            print("[OK] applied 003_scheduled_and_trading_calendar.sql")
        apply_to_db(db_url, sql)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
