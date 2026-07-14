-- Migration 014: user_memory 独立表（PRD §2.4.3）
-- 将原 app_settings 中的 JSON blob 迁移到独立表
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_md TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 从 app_settings 迁移已有数据（若存在）
INSERT INTO user_memory (id, content_md, updated_at)
SELECT
  gen_random_uuid(),
  COALESCE((value->>'content_md')::TEXT, ''),
  COALESCE(
    (value->>'updated_at')::TIMESTAMPTZ,
    NOW()
  )
FROM app_settings
WHERE key = 'user_memory'
  AND value IS NOT NULL
  AND value->>'content_md' IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_memory);

-- 清理 app_settings 中的旧数据
DELETE FROM app_settings WHERE key = 'user_memory';
