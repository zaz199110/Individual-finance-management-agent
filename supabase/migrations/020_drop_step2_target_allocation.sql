-- step2 不再存储 target_allocation 和 allocation_rationale 副本
-- 大类配置以 step1 为准，清除 step2 中的历史冗余数据
UPDATE allocation_plans
SET target_allocation = NULL, allocation_rationale = NULL
WHERE plan_step = 2
  AND (target_allocation IS NOT NULL OR allocation_rationale IS NOT NULL);
