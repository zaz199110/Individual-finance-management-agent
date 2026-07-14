#!/usr/bin/env python3
"""从 manifest 中的公开 URL 下载基金披露 PDF。"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

from lib.common import SEED_ROOT, load_manifest

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    dest.write_bytes(data)
    return len(data)


def main() -> int:
    parser = argparse.ArgumentParser(description="下载演示基金 PDF 到 seed/fund-knowledge/")
    parser.add_argument("--fund", help="仅下载指定基金代码")
    args = parser.parse_args()

    manifest = load_manifest()
    doc_types = manifest["doc_types"]
    ok, fail = 0, 0

    for code, fund in manifest["funds"].items():
        if args.fund and code != args.fund:
            continue
        if not fund.get("pdf_sources"):
            continue
        vault_name = fund["vault_dir"]
        if not vault_name:
            continue

        for item in fund["pdf_sources"]:
            url = item["url"]
            doc_type = item["doc_type"]
            filename = item["filename"]
            dest = (
                SEED_ROOT
                / "fund-knowledge"
                / vault_name
                / "raw"
                / doc_type
                / filename
            )
            try:
                size = download(url, dest)
                print(f"[OK] {code} {filename} ({size:,} bytes)")
                ok += 1
            except Exception as exc:
                print(f"[FAIL] {code} {url}: {exc}")
                fail += 1

        # 预建空 doc_type 目录
        vault_dir = SEED_ROOT / "fund-knowledge" / vault_name
        for dt in doc_types:
            (vault_dir / dt).mkdir(parents=True, exist_ok=True)
            (vault_dir / "raw" / dt).mkdir(parents=True, exist_ok=True)

    print(f"done: {ok} ok, {fail} fail")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
