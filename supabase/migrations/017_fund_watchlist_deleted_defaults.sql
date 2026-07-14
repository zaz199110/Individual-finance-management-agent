-- 017: Track deleted default funds so ensureDefaults does not re-insert them.
-- When a user deletes a default fund, its code is recorded here.
-- ensureDefaults / ensureSupabaseDefaults skip codes present in this table.
CREATE TABLE IF NOT EXISTS fund_watchlist_deleted_defaults (
  fund_code TEXT PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fund_watchlist_deleted_defaults IS 'Records default fund codes explicitly deleted so the ensureDefaults guard does not re-insert them';
