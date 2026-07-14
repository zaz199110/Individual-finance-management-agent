#!/usr/bin/env python3
import json, time
from pathlib import Path
import akshare as ak

symbols = [
  ("sh000300", "CSI300"),
  ("sz399481", "SZ399481"),
  ("sh000012", "SH000012"),
  ("sh000832", "SH000832"),
  ("sz399103", "SZ399103"),
  ("sh000906", "SH000906"),
  ("h11025", "H11025"),
]
out = {}
for sym, label in symbols:
  try:
    df = ak.stock_zh_index_daily(symbol=sym)
    n = len(df)
    out[label] = {
      "symbol": sym,
      "ok": n > 0,
      "rows": n,
      "first": df.head(1).to_dict("records")[0] if n else None,
      "last": df.tail(1).to_dict("records")[0] if n else None,
    }
  except Exception as e:
    out[label] = {"symbol": sym, "ok": False, "error": str(e)[:120]}
  time.sleep(0.8)

Path("automation/tmp/verify_akshare_index_symbols.json").write_text(
  json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
)
print("ok")
