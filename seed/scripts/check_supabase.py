#!/usr/bin/env python3
"""检测 Supabase REST + Postgres + pgvector 是否可用。"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SEED_ROOT = Path(__file__).resolve().parents[1]
SECRETS_PATH = SEED_ROOT.parent / "requirement" / "config" / "secrets.env"
MIGRATIONS = [
    SEED_ROOT / "migrations" / "001_fund_watchlist.sql",
    SEED_ROOT / "migrations" / "002_fund_semantic_entries.sql",
    SEED_ROOT / "migrations" / "003_scheduled_and_trading_calendar.sql",
]


def load_secrets_env() -> None:
    if not SECRETS_PATH.exists():
        return
    for line in SECRETS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and value and key not in os.environ:
            os.environ[key] = value


def check_rest(url: str, anon_key: str) -> tuple[bool, str]:
    if not url or not anon_key:
        return False, "缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY"
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status == 200, f"HTTP {resp.status}"
    except urllib.error.HTTPError as exc:
        # Supabase 常返回 200/401/404，能连上即说明 URL+Key 有效
        if exc.code in (200, 401, 404):
            return True, f"HTTP {exc.code} (reachable)"
        return False, f"HTTP {exc.code}: {exc.reason}"
    except Exception as exc:
        return False, str(exc)


def check_postgres(database_url: str) -> tuple[bool, str]:
    if not database_url:
        return False, "缺少 DATABASE_URL"
    try:
        import psycopg

        with psycopg.connect(database_url, connect_timeout=15) as conn:
            version = conn.execute("SELECT version()").fetchone()[0]
            short = version.split(",")[0]
            return True, short
    except Exception as exc:
        return False, str(exc)


def check_pgvector(database_url: str) -> tuple[bool, str]:
    try:
        import psycopg

        with psycopg.connect(database_url, connect_timeout=15) as conn:
            row = conn.execute(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            ).fetchone()
            if row[0]:
                return True, "installed"
            return False, "未安装，请在 SQL Editor 执行 CREATE EXTENSION vector;"
    except Exception as exc:
        return False, str(exc)


def table_stats(database_url: str) -> dict[str, str]:
    import psycopg

    stats: dict[str, str] = {}
    with psycopg.connect(database_url, connect_timeout=15) as conn:
        for table in ("fund_watchlist", "fund_semantic_entries"):
            exists = conn.execute(
                "SELECT to_regclass(%s) IS NOT NULL",
                (f"public.{table}",),
            ).fetchone()[0]
            if not exists:
                stats[table] = "表不存在"
                continue
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            stats[table] = f"{count} rows"
    return stats


def apply_migrations(database_url: str) -> None:
    import psycopg

    with psycopg.connect(database_url) as conn:
        for path in MIGRATIONS:
            sql = path.read_text(encoding="utf-8")
            conn.execute(sql)
            print(f"[OK] applied {path.name}")
        conn.commit()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="检测 Supabase 连通性")
    parser.add_argument("--apply-migrations", action="store_true", help="执行 seed/migrations 建表")
    args = parser.parse_args()

    load_secrets_env()

    url = os.environ.get("SUPABASE_URL", "")
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    db_url = os.environ.get("DATABASE_URL", "")

    print("=== Supabase 连通检测 ===\n")
    print(f"secrets.env: {'found' if SECRETS_PATH.exists() else 'NOT FOUND'} ({SECRETS_PATH})")
    print(f"SUPABASE_URL: {'set' if url else 'MISSING'}")
    print(f"SUPABASE_ANON_KEY: {'set' if anon else 'MISSING'}")
    print(f"DATABASE_URL: {'set' if db_url else 'MISSING'}\n")

    ok = True

    rest_ok, rest_msg = check_rest(url, anon)
    print(f"REST API: {'OK' if rest_ok else 'FAIL'} — {rest_msg}")
    ok &= rest_ok

    pg_ok, pg_msg = check_postgres(db_url)
    print(f"Postgres: {'OK' if pg_ok else 'FAIL'} — {pg_msg}")
    if not pg_ok:
        if "your-project" in db_url:
            print("  → DATABASE_URL 仍是模板占位，请改成真实项目主机")
        elif "db." in db_url and ("getaddrinfo" in pg_msg or "11001" in pg_msg or "11002" in pg_msg):
            print("  → 直连 db.* 多为 IPv6；请改用 Supabase 控制台 Connect → Session pooler 连接串")
    ok &= pg_ok

    if pg_ok:
        vec_ok, vec_msg = check_pgvector(db_url)
        print(f"pgvector: {'OK' if vec_ok else 'FAIL'} — {vec_msg}")
        ok &= vec_ok

        if args.apply_migrations:
            apply_migrations(db_url)

        try:
            stats = table_stats(db_url)
            for table, stat in stats.items():
                print(f"{table}: {stat}")
        except Exception as exc:
            print(f"table check: SKIP — {exc}")

    print()
    if ok:
        print("[OK] Supabase 连通正常")
        if not args.apply_migrations and pg_ok:
            print("下一步: python scripts/check_supabase.py --apply-migrations")
            print("         python scripts/apply_watchlist.py")
            print("         python scripts/apply_semantic.py --mock-embedding")
        return 0

    print("[FAIL] 请对照 requirement/config/SUPABASE-GUIDE.md 排查")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
