#!/usr/bin/env python3
"""Verify AKShare APIs for DEMO-ABCDEF-01 six funds."""
from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import akshare as ak
except ImportError:
    print(json.dumps({"error": "akshare not installed"}, ensure_ascii=False))
    sys.exit(1)

CODES = ["019305", "017704", "110020", "206007", "519772", "518880"]

APIS = [
    ("fund_individual_basic_info_xq", lambda c: ak.fund_individual_basic_info_xq(symbol=c)),
    ("fund_overview_em", lambda c: ak.fund_overview_em(symbol=c)),
    (
        "fund_individual_detail_hold_xq",
        lambda c: ak.fund_individual_detail_hold_xq(symbol=c, date="20241231"),
    ),
    ("fund_portfolio_hold_em", lambda c: ak.fund_portfolio_hold_em(symbol=c, date="2024")),
    (
        "fund_portfolio_bond_hold_em",
        lambda c: ak.fund_portfolio_bond_hold_em(symbol=c, date="2024"),
    ),
    (
        "fund_portfolio_industry_allocation_em",
        lambda c: ak.fund_portfolio_industry_allocation_em(symbol=c, date="2024"),
    ),
]


def main() -> int:
    out: dict[str, dict[str, str]] = {}
    for code in CODES:
        out[code] = {}
        for name, fn in APIS:
            try:
                df = fn(code)
                n = 0 if df is None else len(df)
                out[code][name] = "ok" if n > 0 else "empty"
            except Exception as e:
                out[code][name] = f"fail:{type(e).__name__}:{str(e)[:80]}"
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
