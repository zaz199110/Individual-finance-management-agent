-- App core tables (chat shell + settings) — apply before seed 001–007

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT NOT NULL UNIQUE CHECK (slot IN ('reasoning', 'deep', 'vision', 'web', 'embedding')),
  model_name TEXT,
  api_base_url TEXT,
  api_key_encrypted TEXT,
  use_same_as_reasoning BOOLEAN NOT NULL DEFAULT true,
  check_status TEXT NOT NULL DEFAULT 'unchecked'
    CHECK (check_status IN ('unchecked', 'checking', 'passed', 'failed')),
  last_checked_at TIMESTAMPTZ,
  last_error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Chat shell
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '新对话',
  conversation_type TEXT NOT NULL DEFAULT 'chat'
    CHECK (conversation_type IN ('chat', 'profile', 'plan', 'portfolio', 'fund')),
  metadata JSONB NOT NULL DEFAULT '{"type_locked": false, "active_tab": "chat", "has_unconfirmed": false}'::jsonb,
  checkpoint JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_type_locked ON conversations (conversation_type, (metadata->>'type_locked'));

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  attachments JSONB,
  metadata JSONB,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- Workflow (s12 / SH-08 / s13)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  parent_task_key TEXT,
  node_depth INT NOT NULL DEFAULT 1 CHECK (node_depth IN (1, 2)),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'blocked', 'cancelled')),
  blocked_by JSONB,
  skill TEXT,
  command TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, task_key)
);

CREATE TABLE IF NOT EXISTS workflow_locks (
  lock_key TEXT PRIMARY KEY CHECK (lock_key IN ('profile', 'plan', 'portfolio')),
  holder_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  acquired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('deep_report', 'deep_analysis', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'done', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS propose_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'profile_basic', 'goal_constraint', 'plan_allocation', 'plan_detail', 'holdings'
  )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'abandoned', 'superseded')),
  summary_zh TEXT NOT NULL,
  payload_path TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES propose_artifacts(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default model slots
INSERT INTO model_settings (slot, use_same_as_reasoning, check_status)
VALUES
  ('reasoning', false, 'unchecked'),
  ('deep', true, 'unchecked'),
  ('vision', true, 'unchecked'),
  ('web', true, 'unchecked'),
  ('embedding', true, 'unchecked')
ON CONFLICT (slot) DO NOTHING;
