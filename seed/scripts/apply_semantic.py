#!/usr/bin/env python3
"""导入 fund_semantic_entries（L2 seed · 通用 FAQ 100 条 · fund_code=*）。"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
from pathlib import Path

from lib.common import SEED_ROOT, load_secrets_env

ENTRIES_PATH = SEED_ROOT / "fund_semantic_entries.json"
DIM = 1536


def tokenize(text: str) -> list[str]:
    return re.findall(r"[\u4e00-\u9fff]{1,4}|[a-zA-Z0-9]{2,}", text.lower())


def mock_embedding(text: str, dim: int = DIM) -> list[float]:
    """离线测试用确定性伪向量（非生产 embedding）。"""
    tokens = tokenize(text)
    vec = [0.0] * dim
    if not tokens:
        return vec
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for i in range(0, min(len(digest), dim)):
            vec[i % dim] += (digest[i] / 255.0 - 0.5) * 0.1
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def fetch_embedding(text: str, api_url: str, api_key: str, model: str) -> list[float]:
    import urllib.request

    payload = json.dumps(
        {"model": model, "input": text},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/embeddings",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["data"][0]["embedding"]


def load_entries() -> dict:
    with ENTRIES_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def apply(database_url: str, use_mock: bool) -> int:
    import psycopg

    payload = load_entries()
    fund_code = payload.get("fund_code", "*")
    entries = payload["entries"]

    api_url = os.environ.get("EMBEDDING_API_URL") or os.environ.get("LLM_API_URL")
    api_key = os.environ.get("EMBEDDING_API_KEY") or os.environ.get("LLM_API_KEY")
    model = os.environ.get("EMBEDDING_MODEL_NAME", "text-embedding-3-small")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM fund_semantic_entries WHERE entry_type = 'faq'")
            for entry in entries:
                text = f"{entry['title']}\n{entry['body']}"
                if use_mock or not (api_url and api_key):
                    emb = mock_embedding(text)
                else:
                    emb = fetch_embedding(text, api_url, api_key, model)

                cur.execute(
                    """
                    INSERT INTO fund_semantic_entries
                    (fund_code, entry_type, title, body, embedding,
                     source_file_path, metadata, updated_at)
                    VALUES (%s, %s, %s, %s, %s::vector, %s, %s::jsonb, NOW())
                    """,
                    (
                        fund_code,
                        entry["entry_type"],
                        entry["title"],
                        entry["body"],
                        vector_literal(emb),
                        entry.get("source_file_path"),
                        json.dumps(entry.get("metadata", {}), ensure_ascii=False),
                    ),
                )
            cur.execute(
                "SELECT entry_type, COUNT(*) FROM fund_semantic_entries WHERE fund_code = %s GROUP BY entry_type",
                (fund_code,),
            )
            counts = cur.fetchall()
        conn.commit()

    print(f"fund_semantic_entries ({fund_code}):")
    for row in counts:
        print(f"  {row[0]}: {row[1]}")
    return 0


def dry_run_report() -> None:
    payload = load_entries()
    faq = sum(1 for e in payload["entries"] if e["entry_type"] == "faq")
    expert = sum(1 for e in payload["entries"] if e["entry_type"] == "expert_opinion")
    print(f"--- semantic seed dry-run ---")
    print(f"fund_code: {payload['fund_code']}")
    print(f"FAQ: {faq}, expert: {expert}, total: {len(payload['entries'])}")


def main() -> int:
    parser = argparse.ArgumentParser(description="导入 L2 语义种子")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mock-embedding", action="store_true", help="离线测试用伪向量")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()

    load_secrets_env()
    database_url = args.database_url or os.environ.get("DATABASE_URL")

    if args.dry_run or not database_url:
        dry_run_report()
        if not database_url:
            print("[INFO] 未设置 DATABASE_URL，仅 dry-run")
        return 0

    return apply(database_url, use_mock=args.mock_embedding)


if __name__ == "__main__":
    raise SystemExit(main())
