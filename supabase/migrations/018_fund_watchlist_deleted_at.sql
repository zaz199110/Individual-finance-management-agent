-- 018: Add soft-delete column to fund_watchlist.
-- Replaces the separate fund_watchlist_deleted_defaults table.
-- Existing rows: deleted_at defaults to NULL (active).

ALTER TABLE fund_watchlist ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN fund_watchlist.deleted_at IS 'Soft-delete timestamp. NULL = active. Non-NULL = deleted.';

-- Migrate existing deleted defaults into the main table
UPDATE fund_watchlist fw
SET deleted_at = dd.deleted_at
FROM fund_watchlist_deleted_defaults dd
WHERE fw.fund_code = dd.fund_code AND fw.deleted_at IS NULL;

-- Add index for filtering active funds
CREATE INDEX IF NOT EXISTS idx_fund_watchlist_active ON fund_watchlist (deleted_at) WHERE deleted_at IS NULL;
