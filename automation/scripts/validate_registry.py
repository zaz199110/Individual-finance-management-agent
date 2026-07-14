#!/usr/bin/env python3
"""校验 agents/registry.yaml 与 PRD §5.3.9b（chat）· §5.3.9a（fund）一致。"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("pip install pyyaml")
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "agents" / "registry.yaml"

FUND_ANALYSIS = {
    "web_search",
    "vision_parse",
    "fund_lookup",
    "fund_knowledge_explore",
    "fund_knowledge_semantic_search",
    "profile_read",
    "report_draft",
    "report_publish",
    "seed_sync",
}
FUND_WATCHLIST = {"fund_search", "fund_watchlist_add", "fund_watchlist_remove"}
FUND_ONLY = {
    "fund_lookup",
    "fund_knowledge_explore",
    "fund_knowledge_semantic_search",
    *FUND_WATCHLIST,
}

CHAT_SLASH = {"web_search", "vision_parse"}
CHAT_USAGE = CHAT_SLASH


def main() -> int:
    data = yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in data.get("commands", [])}

    errors: list[str] = []

    for cid in FUND_ANALYSIS | FUND_WATCHLIST:
        if cid not in by_id:
            errors.append(f"missing command: {cid}")

    chat_page = data.get("usage_pages", {}).get("chat", {})
    chat_listed = set()
    for g in chat_page.get("groups", []):
        chat_listed.update(g.get("command_ids") or [])
    if chat_listed != CHAT_USAGE:
        errors.append(f"usage_pages.chat command_ids mismatch: {sorted(chat_listed)}")

    for cid in CHAT_SLASH:
        c = by_id.get(cid, {})
        if "chat" not in (c.get("scenes") or []):
            errors.append(f"{cid}: must include scene chat")
        if not c.get("slash_completion"):
            errors.append(f"{cid}: slash_completion must be true for chat domain")

    compact = by_id.get("compact", {})
    if "chat" not in (compact.get("scenes") or []):
        errors.append("compact: must include scene chat")
    if compact.get("slash_completion"):
        errors.append("compact: slash_completion must be false (Harness internal)")

    fund_page = data.get("usage_pages", {}).get("fund", {})
    listed = set()
    for g in fund_page.get("groups", []):
        listed.update(g.get("command_ids") or [])
    if listed != FUND_ANALYSIS | FUND_WATCHLIST:
        errors.append(f"usage_pages.fund command_ids mismatch: {sorted(listed)}")

    for cid in FUND_ONLY:
        c = by_id.get(cid, {})
        if "fund" not in (c.get("scenes") or []):
            errors.append(f"{cid}: must include scene fund")
        if not c.get("slash_completion"):
            errors.append(f"{cid}: slash_completion must be true")

    if errors:
        for e in errors:
            print(f"[FAIL] {e}")
        return 1

    print(f"[OK] registry.yaml — {len(by_id)} commands, chat + fund domain aligned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
