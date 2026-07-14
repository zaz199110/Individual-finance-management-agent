-- holdings_versions 持仓版本表（§8.9 · PORT-SNAPSHOT-01）
-- 依赖：无 FK 至 profile/plan（持仓独立维护 · §3 实体关系）
-- 样例 JSON → requirement/docs/samples/holdings-propose-payload.examples.json

CREATE TABLE IF NOT EXISTS holdings_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  positions JSONB NOT NULL,
  change_summary JSONB NOT NULL,
  previous_version_id UUID REFERENCES holdings_versions (id),
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holdings_versions_positions_array CHECK (jsonb_typeof(positions) = 'array'),
  CONSTRAINT holdings_versions_positions_min CHECK (jsonb_array_length(positions) >= 1),
  CONSTRAINT holdings_versions_positions_max CHECK (jsonb_array_length(positions) <= 100)
);

-- 全局仅一条 is_current=true（§8.9.1 · 面板真源）
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_versions_one_current
  ON holdings_versions (is_current)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_holdings_versions_confirmed_at
  ON holdings_versions (confirmed_at DESC);

CREATE INDEX IF NOT EXISTS idx_holdings_versions_previous
  ON holdings_versions (previous_version_id)
  WHERE previous_version_id IS NOT NULL;

COMMENT ON TABLE holdings_versions IS '持仓版本快照 · PRD §8.9 · 同行键 fund_code+invested_at';
COMMENT ON COLUMN holdings_versions.positions IS 'jsonb 数组 · 1～100 行 · §8.9.2';
COMMENT ON COLUMN holdings_versions.change_summary IS '调仓摘要 · §8.2.1 · initial/update';
COMMENT ON COLUMN holdings_versions.previous_version_id IS '版本链 · 首版 null';
