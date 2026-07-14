-- KB-02 · L2 pgvector 相似度检索 RPC
CREATE OR REPLACE FUNCTION match_fund_semantic_entries(
  query_embedding vector(1536),
  match_fund_code text,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  fund_code text,
  entry_type text,
  title text,
  body text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.fund_code,
    e.entry_type,
    e.title,
    e.body,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM fund_semantic_entries e
  WHERE e.entry_type = 'faq'
    AND e.embedding IS NOT NULL
    AND (e.fund_code = match_fund_code OR e.fund_code = '*')
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
