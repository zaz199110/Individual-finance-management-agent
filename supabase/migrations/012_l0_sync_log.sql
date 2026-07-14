-- L0 sync audit log (fund.prep.l0_sync · complements data/l0-cache + l0-sync-log.jsonl)

CREATE TABLE IF NOT EXISTS l0_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_code TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lookup_source TEXT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_l0_sync_log_fund_synced
  ON l0_sync_log (fund_code, synced_at DESC);

COMMENT ON TABLE l0_sync_log IS '基金 L0 同步日志 · fund.prep.l0_sync · 与 data/l0-cache 互补';
