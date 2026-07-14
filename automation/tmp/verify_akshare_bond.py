#!/usr/bin/env python3
import json, time
from pathlib import Path
import akshare as ak

out = {}
candidates = [
  ("stock_zh_index_daily_sh000832", lambda: ak.stock_zh_index_daily(symbol="sh000832")),
  ("stock_zh_index_daily_sz399481", lambda: ak.stock_zh_index_daily(symbol="sz399481")),
  ("bond_china_close_return", lambda: ak.bond_china_close_return()),
  ("bond_china_yield", lambda: ak.bond_china_yield()),
  ("index_value_name_fund", lambda: ak.index_value_name_fund()),
]
for name, fn in candidates:
  try:
    df = fn()
    n = len(df) if df is not None else 0
    out[name] = {"ok": n>0, "rows": n, "cols": list(df.columns)[:10] if n else [], "tail": df.tail(1).to_dict("records") if n else []}
  except Exception as e:
    out[name] = {"ok": False, "error": str(e)[:200]}
  time.sleep(1)

Path("automation/tmp/verify_akshare_bond_result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
print("done")
