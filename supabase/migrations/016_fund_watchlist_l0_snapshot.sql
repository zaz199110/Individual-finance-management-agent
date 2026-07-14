-- L0 快照缓存列：存储 L0FundSnapshot JSON，含费率/万份收益等补充字段
-- 与本地 data/l0-cache/{fundCode}.json 互补，供查询端直接读取无需走本地文件

ALTER TABLE fund_watchlist ADD COLUMN IF NOT EXISTS l0_snapshot JSONB;

COMMENT ON COLUMN fund_watchlist.l0_snapshot IS 'L0 快照缓存 (L0FundSnapshot JSON)，含费率/万份收益等联网补充字段';
