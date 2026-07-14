-- profile_versions · investment_goal_constraints · goal_constraint_revisions
-- PRD §6.12 · PH-PROFILE-GV-02 · PH-PROFILE-GT-01
-- 样例 JSON → requirement/docs/samples/profile-propose-payload.examples.json
-- 须在 004_allocation_plans.sql 之前执行

CREATE TABLE IF NOT EXISTS profile_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  basic_info JSONB NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profile_versions_basic_info_object CHECK (jsonb_typeof(basic_info) = 'object')
);

-- 全局仅一条 is_current=true（§6.12.1）
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_versions_one_current
  ON profile_versions (is_current)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_profile_versions_confirmed_at
  ON profile_versions (confirmed_at DESC);

CREATE TABLE IF NOT EXISTS investment_goal_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_version_id UUID NOT NULL REFERENCES profile_versions (id),
  goal_type TEXT NOT NULL CHECK (
    goal_type IN (
      'marriage_child',
      'housing',
      'education',
      'retirement',
      'wealth_growth'
    )
  ),
  display_name TEXT,
  goal_detail JSONB NOT NULL,
  investment_constraints JSONB NOT NULL,
  principal_amount NUMERIC NOT NULL CHECK (principal_amount >= 0),
  monthly_amount NUMERIC NOT NULL CHECK (monthly_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT investment_goal_constraints_goal_detail_object
    CHECK (jsonb_typeof(goal_detail) = 'object'),
  CONSTRAINT investment_goal_constraints_constraints_object
    CHECK (jsonb_typeof(investment_constraints) = 'object')
);

-- PH-PROFILE-GT-01：每种 goal_type 至多一条 is_active=true
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_constraints_one_active_per_type
  ON investment_goal_constraints (goal_type)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_goal_constraints_profile_version
  ON investment_goal_constraints (profile_version_id);

CREATE INDEX IF NOT EXISTS idx_goal_constraints_active
  ON investment_goal_constraints (is_active, confirmed_at DESC)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS goal_constraint_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_constraint_id UUID NOT NULL REFERENCES investment_goal_constraints (id),
  revision_no INT NOT NULL CHECK (revision_no >= 1),
  profile_version_id UUID NOT NULL REFERENCES profile_versions (id),
  goal_detail JSONB NOT NULL,
  investment_constraints JSONB NOT NULL,
  principal_amount NUMERIC NOT NULL CHECK (principal_amount >= 0),
  monthly_amount NUMERIC NOT NULL CHECK (monthly_amount >= 0),
  source_artifact_id UUID,
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT goal_constraint_revisions_goal_detail_object
    CHECK (jsonb_typeof(goal_detail) = 'object'),
  CONSTRAINT goal_constraint_revisions_constraints_object
    CHECK (jsonb_typeof(investment_constraints) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_constraint_revisions_no
  ON goal_constraint_revisions (goal_constraint_id, revision_no);

CREATE INDEX IF NOT EXISTS idx_goal_constraint_revisions_goal
  ON goal_constraint_revisions (goal_constraint_id, revision_no DESC);

COMMENT ON TABLE profile_versions IS '客户信息层 · PRD §6.12.1';
COMMENT ON TABLE investment_goal_constraints IS '投资需求主表 · PRD §6.12.3';
COMMENT ON TABLE goal_constraint_revisions IS '约束修订快照 G2 · PRD §6.12.6 · PH-PROFILE-GV-02';
