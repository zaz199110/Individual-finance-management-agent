from __future__ import annotations

import hashlib
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SEED_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = SEED_ROOT / "manifest.json"
SECRETS_PATH = SEED_ROOT.parent / "requirement" / "config" / "secrets.env"
DEFAULT_APP_ROOT = SEED_ROOT.parent / "agent-demo-app"


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


def load_manifest() -> dict[str, Any]:
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify_chunk_id(fund_code: str, file_hash: str, line_start: int, seq: int) -> str:
    short = file_hash[:12]
    return f"fk_{fund_code}_{short}_{line_start}_{seq}"


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return {}, text
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"')
    body = text[match.end() :]
    return meta, body


def ensure_doc_type_dirs(vault_dir: Path, doc_types: list[str]) -> None:
    for doc_type in doc_types:
        (vault_dir / doc_type).mkdir(parents=True, exist_ok=True)
        (vault_dir / "raw" / doc_type).mkdir(parents=True, exist_ok=True)
