-- allocation_plans 表（§7.10 · PL-02 唯一 is_current）
-- 依赖：须先执行 006_profile_core.sql（profile_versions · investment_goal_constraints）
-- 样例 JSON → requirement/docs/samples/plan-propose-payload.examples.json

CREATE TABLE IF NOT EXISTS allocation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_constraint_id UUID NOT NULL REFERENCES investment_goal_constraints (id),
  profile_version_id UUID NOT NULL REFERENCES profile_versions (id),
  plan_step INT NOT NULL CHECK (plan_step IN (1, 2)),
  is_current BOOLEAN NOT NULL DEFAULT false,
  target_allocation JSONB,
  allocation_rationale TEXT,
  detailed_plan JSONB,
  execution_schedule JSONB,
  web_citations JSONB,
  allocation_confirmed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每约束至多一条 step=2 且 is_current=true（PL-02）
CREATE UNIQUE INDEX IF NOT EXISTS idx_allocation_plans_one_current
  ON allocation_plans (goal_constraint_id)
  WHERE is_current = true AND plan_step = 2;

CREATE INDEX IF NOT EXISTS idx_allocation_plans_goal_step
  ON allocation_plans (goal_constraint_id, plan_step DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_allocation_plans_profile_version
  ON allocation_plans (profile_version_id);

COMMENT ON TABLE allocation_plans IS '资产配置方案 · PRD §7.10';
COMMENT ON COLUMN allocation_plans.target_allocation IS '第一步大类 jsonb · 无 fund_code · 比例和 100%';
COMMENT ON COLUMN allocation_plans.detailed_plan IS '第二步明细 jsonb · 含 fund_code + recommendation_reason';
COMMENT ON COLUMN allocation_plans.execution_schedule IS '分批建仓 · 含 fund_deploy[] initial_tranche periodic_tranche';

