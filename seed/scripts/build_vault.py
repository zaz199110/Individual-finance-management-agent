#!/usr/bin/env python3
"""组装 vault：复制 bundled md、创建 206007 缺失验收、同步到 APP_ROOT。"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from lib.common import DEFAULT_APP_ROOT, SEED_ROOT, ensure_doc_type_dirs, load_manifest


def copy_bundled(fund: dict) -> int:
    vault_name = fund["vault_dir"]
    if not vault_name:
        return 0
    vault_dir = SEED_ROOT / "fund-knowledge" / vault_name
    ensure_doc_type_dirs(vault_dir, load_manifest()["doc_types"])
    copied = 0

    for item in fund.get("bundled_md", []):
        src = SEED_ROOT / item["source"]
        dest = vault_dir / item["doc_type"] / item["filename"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"[OK] bundled -> {dest.relative_to(SEED_ROOT)}")
        copied += 1

    for rel_path in fund.get("expert_opinion_md", []):
        src = SEED_ROOT / "bundled" / fund["fund_code"] / rel_path
        dest = vault_dir / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"[OK] expert -> {dest.relative_to(SEED_ROOT)}")
        copied += 1

    return copied


def sync_to_app(app_root: Path, dry_run: bool) -> None:
    src = SEED_ROOT / "fund-knowledge"
    dest = app_root / "data" / "fund-knowledge"
    if dry_run:
        print(f"[DRY] would sync {src} -> {dest}")
        return
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    print(f"[OK] synced vault -> {dest}")


def main() -> int:
    parser = argparse.ArgumentParser(description="组装并可选同步 fund-knowledge vault")
    parser.add_argument("--app-root", type=Path, default=DEFAULT_APP_ROOT)
    parser.add_argument("--sync", action="store_true", help="复制到编码仓 data/fund-knowledge/")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest()
    total = 0

    for code, fund in manifest["funds"].items():
        if fund.get("vault_dir"):
            total += copy_bundled(fund)
        else:
            print(f"[SKIP] {code} manifest 未配置 vault_dir（若 seed/fund-knowledge 已有目录可更新 manifest）")

    if args.sync:
        sync_to_app(args.app_root, args.dry_run)

    print(f"bundled files copied: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
