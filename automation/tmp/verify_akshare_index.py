#!/usr/bin/env python3
"""Verify AKShare index APIs for PLAN-RISK-INDEX-01."""
from __future__ import annotations

import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import akshare as ak
except ImportError as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False))
    sys.exit(1)


def try_api(name: str, fn) -> None:
    out[name] = {}
    try:
        df = fn()
        n = 0 if df is None else len(df)
        cols = list(df.columns) if df is not None and n else []
        tail = df.tail(2).to_dict("records") if n else []
        out[name] = {"ok": n > 0, "rows": n, "cols": cols, "tail": tail}
    except Exception as e:
        out[name] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}


out: dict = {}

# CSI 300 — doc: index_zh_a_hist
try_api("index_zh_a_hist_000300", lambda: ak.index_zh_a_hist(symbol="000300", period="daily"))
try_api("stock_zh_index_daily_em_sh000300", lambda: ak.stock_zh_index_daily_em(symbol="sh000300"))

# Bond / composite candidates
for sym in ["000832", "H11001", "000922"]:
    try_api(f"index_zh_a_hist_{sym}", lambda s=sym: ak.index_zh_a_hist(symbol=s, period="daily"))

# Eastmoney index hist (doc id1 area)
try_api("index_zh_a_hist_csindex_000832", lambda: ak.index_zh_a_hist(symbol="000832", period="daily"))

# Money market — use representative money fund daily or index
try_api("fund_money_fund_daily_em", lambda: ak.fund_money_fund_daily_em())
try_api("index_zh_a_hist_000012", lambda: ak.index_zh_a_hist(symbol="000012", period="daily"))

print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
