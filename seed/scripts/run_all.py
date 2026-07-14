#!/usr/bin/env python3
"""
DEMO-ABC-01 一键种子流水线：
  1. download_pdfs
  2. convert_pdf
  3. build_vault
  4. build_index
  5. apply_watchlist（需 DATABASE_URL）
  6. apply_semantic（需 DATABASE_URL）
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPTS = Path(__file__).resolve().parent


def run_step(name: str, args: list[str]) -> int:
    cmd = [sys.executable, str(SCRIPTS / name), *args]
    print(f"\n=== {name} {' '.join(args)} ===")
    result = subprocess.run(cmd, cwd=SCRIPTS)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="运行完整演示种子流水线")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--skip-db", action="store_true", help="跳过 Supabase 写入")
    parser.add_argument("--mock-embedding", action="store_true")
    parser.add_argument("--sync-app", action="store_true", help="同步 vault 到 agent-demo-app")
    parser.add_argument("--explore", action="store_true", help="建索引后试检索")
    args = parser.parse_args()

    steps: list[tuple[str, list[str]]] = []
    if not args.skip_download:
        steps.append(("download_pdfs.py", []))
    steps.extend(
        [
            ("convert_pdf.py", []),
            ("build_vault.py", ["--sync"] if args.sync_app else []),
            (
                "build_index.py",
                ["--explore", "--fund", "019305", "--query", "管理费"]
                if args.explore
                else [],
            ),
        ]
    )

    if not args.skip_db:
        steps.append(("apply_watchlist.py", []))
        steps.append(
            (
                "apply_semantic.py",
                ["--mock-embedding"] if args.mock_embedding else [],
            )
        )

    for name, step_args in steps:
        code = run_step(name, step_args)
        if code != 0:
            print(f"[FAIL] {name} exit {code}")
            return code

    print("\n[OK] seed pipeline complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
