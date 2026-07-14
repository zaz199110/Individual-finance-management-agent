-- report_index 四类报告索引（§4.1.7a）
-- 依赖：006_profile_core · 004_allocation_plans · 005_holdings_versions
-- 须在 004、005 之后执行

CREATE TABLE IF NOT EXISTS report_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (
    report_type IN ('profile', 'plan', 'portfolio', 'fund')
  ),
  report_slug TEXT,
  report_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_path TEXT NOT NULL,
  metadata JSONB,
  profile_version_id UUID REFERENCES profile_versions (id),
  goal_constraint_id UUID REFERENCES investment_goal_constraints (id),
  goal_constraint_revision_id UUID REFERENCES goal_constraint_revisions (id),
  allocation_plan_id UUID REFERENCES allocation_plans (id),
  holdings_version_id UUID REFERENCES holdings_versions (id),
  fund_code TEXT,
  CONSTRAINT report_index_fund_slug_unique UNIQUE (report_slug)
);

CREATE INDEX IF NOT EXISTS idx_report_index_type_generated
  ON report_index (report_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_index_goal_constraint
  ON report_index (goal_constraint_id, generated_at DESC)
  WHERE goal_constraint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_index_profile_version
  ON report_index (profile_version_id)
  WHERE profile_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_index_fund_code
  ON report_index (fund_code, generated_at DESC)
  WHERE fund_code IS NOT NULL;

COMMENT ON TABLE report_index IS '四类报告元数据索引 · PRD §4.1.7a';
COMMENT ON COLUMN report_index.goal_constraint_revision_id IS 'profile 发布绑修订快照 · PH-PROFILE-GV-02';
COMMENT ON COLUMN report_index.report_slug IS 'fund 业务 ID · RPT-FUND-01 · UNIQUE';
