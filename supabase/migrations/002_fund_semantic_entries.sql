-- L2 语义子库（§3.5.6 · KB-02）
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fund_semantic_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_code TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('faq', 'expert_opinion')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  embedding vector(1536),
  source_file_path TEXT,
  chunk_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fund_semantic_fund_code ON fund_semantic_entries (fund_code);
CREATE INDEX IF NOT EXISTS idx_fund_semantic_entry_type ON fund_semantic_entries (entry_type);

-- 向量相似度索引（维度须与 embedding 模型一致；1536 为 OpenAI text-embedding-3-small 默认）
CREATE INDEX IF NOT EXISTS idx_fund_semantic_embedding
  ON fund_semantic_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);
