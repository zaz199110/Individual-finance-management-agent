#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import akshare as ak

out: dict = {}


def try_api(name: str, fn) -> None:
    try:
        df = fn()
        n = 0 if df is None else len(df)
        cols = list(df.columns) if df is not None and n else []
        tail = df.tail(2).to_dict("records") if n else []
        out[name] = {"ok": n > 0, "rows": n, "cols": cols, "tail": tail}
    except Exception as e:
        out[name] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}


try_api("index_zh_a_hist_sh000300", lambda: ak.index_zh_a_hist(symbol="sh000300", period="daily"))
time.sleep(1)
try_api("index_zh_a_hist_000300", lambda: ak.index_zh_a_hist(symbol="000300", period="daily"))
time.sleep(1)
try_api("stock_zh_index_daily_sh000300", lambda: ak.stock_zh_index_daily(symbol="sh000300"))
time.sleep(1)
try_api("stock_zh_index_daily_em_sh000300", lambda: ak.stock_zh_index_daily_em(symbol="sh000300"))
time.sleep(1)
try_api("index_zh_a_hist_000832", lambda: ak.index_zh_a_hist(symbol="000832", period="daily"))
time.sleep(1)
try_api("index_zh_a_hist_H11001", lambda: ak.index_zh_a_hist(symbol="H11001", period="daily"))
time.sleep(1)
try_api("fund_money_fund_daily_em", lambda: ak.fund_money_fund_daily_em())

Path("automation/tmp/verify_akshare_index_result.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2, default=str),
    encoding="utf-8",
)
print("written automation/tmp/verify_akshare_index_result.json")
