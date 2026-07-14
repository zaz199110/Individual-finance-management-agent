-- allocation_citations · 第一步联网引用（PL-PLAN-S1-NET-01）
-- 依赖：005_allocation_plans.sql

ALTER TABLE allocation_plans
  ADD COLUMN IF NOT EXISTS allocation_citations JSONB;

COMMENT ON COLUMN allocation_plans.allocation_citations IS '第一步 web_search 引用 ≤3 · 不进规划书 §三';
