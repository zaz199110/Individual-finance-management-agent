-- WL-01 · 三只品类默认基金（货币/债券/股票 各一）
-- 用法：表为空时执行；编码仓见 supabase/migrations 或 seed/

INSERT INTO fund_watchlist (id, fund_code, fund_name, added_at, last_analysis_at)
SELECT
  gen_random_uuid(),
  v.fund_code,
  v.fund_name,
  (TIMESTAMPTZ '2026-01-01 00:00:00+08') + (v.ord * INTERVAL '1 second'),
  NULL
FROM (
  VALUES
    (1, '000198', '天弘余额宝货币'),        -- 货币型
    (2, '217022', '招商产业债券A'),          -- 债券型
    (3, '110022', '易方达消费行业股票')      -- 股票型
) AS v(ord, fund_code, fund_name)
WHERE NOT EXISTS (SELECT 1 FROM fund_watchlist LIMIT 1);
