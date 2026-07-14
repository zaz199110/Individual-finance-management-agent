#!/usr/bin/env python3
"""单文件 PDF → Markdown（供 fund-knowledge 上传 API 调用）。"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

OCR_THRESHOLD = 50


def convert_pdf(pdf_path: Path, ocr_dir: Path | None = None) -> tuple[str, list[int], int, dict[int, str]]:
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    pages: list[str] = []
    ocr_pages: list[int] = []
    ocr_images: dict[int, str] = {}

    if ocr_dir:
        ocr_dir.mkdir(parents=True, exist_ok=True)

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").strip()
        if len(text) < OCR_THRESHOLD:
            page_no = page_num + 1
            ocr_pages.append(page_no)
            if ocr_dir:
                pix = page.get_pixmap(dpi=150)
                img_path = ocr_dir / f"page-{page_no}.png"
                pix.save(str(img_path))
                ocr_images[page_no] = str(img_path)
            pages.append(
                f"<!-- 第 {page_no} 页 -->\n<!-- OCR_PENDING:{page_no} -->"
            )
        else:
            pages.append(f"<!-- 第 {page_num + 1} 页 -->\n{text}")

    page_count = len(doc)
    doc.close()
    return "\n\n".join(pages), ocr_pages, page_count, ocr_images


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert one PDF to markdown")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fund-code", required=True)
    parser.add_argument("--doc-type", required=True)
    parser.add_argument("--source-filename", required=True)
    parser.add_argument("--ocr-dir", type=Path, default=None, help="Render OCR page PNGs here")
    args = parser.parse_args()

    if not args.input.exists():
        print(json.dumps({"ok": False, "error": "input not found"}))
        return 1

    try:
        body, ocr_pages, page_count, ocr_images = convert_pdf(args.input, args.ocr_dir)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1

    method = "mixed" if ocr_pages else "text"
    if ocr_pages and page_count == len(ocr_pages):
        method = "ocr"

    from datetime import datetime, timezone

    frontmatter = (
        "---\n"
        f'source_filename: "{args.source_filename}"\n'
        "source_format: pdf\n"
        f'doc_type: "{args.doc_type}"\n'
        f"conversion_method: {method}\n"
        f'uploaded_at: "{datetime.now(timezone.utc).isoformat()}"\n'
        f'fund_code: "{args.fund_code}"\n'
    )
    if ocr_pages:
        frontmatter += f"ocr_pages: [{', '.join(str(p) for p in ocr_pages)}]\n"
    frontmatter += "---\n\n"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(frontmatter + body, encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "page_count": page_count,
                "conversion_method": method,
                "ocr_pages": ocr_pages,
                "ocr_images": ocr_images,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
