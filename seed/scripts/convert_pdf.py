#!/usr/bin/env python3
"""PDF → Markdown（PyMuPDF 文本层提取，对标 §3.5.3a）。"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from lib.common import SEED_ROOT, load_manifest, sha256_file, utc_now_iso

OCR_THRESHOLD = 50


def convert_pdf(pdf_path: Path) -> tuple[str, list[int]]:
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    pages: list[str] = []
    ocr_pages: list[int] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").strip()
        if len(text) < OCR_THRESHOLD:
            ocr_pages.append(page_num + 1)
            pages.append(f"<!-- 第 {page_num + 1} 页 -->\n<!-- OCR 需要图片理解模型 -->")
        else:
            pages.append(f"<!-- 第 {page_num + 1} 页 -->\n{text}")

    doc.close()
    return "\n\n".join(pages), ocr_pages


def md_filename(pdf_name: str) -> str:
    stem = Path(pdf_name).stem
    stem = re.sub(r"[^\w\u4e00-\u9fff\-]+", "-", stem)
    return f"{stem}.md"


def main() -> int:
    parser = argparse.ArgumentParser(description="将 seed vault 中的 PDF 转为 md")
    parser.add_argument("--fund", help="仅处理指定基金")
    args = parser.parse_args()

    manifest = load_manifest()
    converted = 0

    for code, fund in manifest["funds"].items():
        if args.fund and code != args.fund:
            continue
        vault_name = fund.get("vault_dir")
        if not vault_name:
            continue

        vault_dir = SEED_ROOT / "fund-knowledge" / vault_name
        raw_root = vault_dir / "raw"
        if not raw_root.exists():
            continue

        for pdf_path in sorted(raw_root.rglob("*.pdf")):
            rel = pdf_path.relative_to(raw_root)
            doc_type = rel.parts[0]
            body, ocr_pages = convert_pdf(pdf_path)
            content_hash = sha256_file(pdf_path)
            method = "mixed" if ocr_pages else "text"

            frontmatter = (
                "---\n"
                f"source_filename: {pdf_path.name}\n"
                "source_format: pdf\n"
                f"doc_type: {doc_type}\n"
                f"conversion_method: {method}\n"
                f"uploaded_at: {utc_now_iso()}\n"
                f"content_hash: {content_hash}\n"
                f"fund_code: \"{code}\"\n"
            )
            if ocr_pages:
                frontmatter += f"ocr_pages: [{', '.join(str(p) for p in ocr_pages)}]\n"
            frontmatter += "---\n\n"

            out_path = vault_dir / doc_type / md_filename(pdf_path.name)
            out_path.write_text(frontmatter + body, encoding="utf-8")
            print(f"[OK] {code} {pdf_path.name} -> {out_path.relative_to(SEED_ROOT)}")
            converted += 1

    print(f"converted {converted} pdf(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
