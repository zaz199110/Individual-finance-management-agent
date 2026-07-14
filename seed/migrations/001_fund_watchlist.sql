-- fund_watchlist 表（§3.4.1）
CREATE TABLE IF NOT EXISTS fund_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_code TEXT NOT NULL UNIQUE,
  fund_name TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_analysis_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fund_watchlist_added_at ON fund_watchlist (added_at DESC);
