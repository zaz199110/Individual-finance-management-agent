-- 定时持仓分析 + 交易日历（§3.4.0 · §4.2）

CREATE TABLE IF NOT EXISTS trading_calendar (
  cal_date DATE NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'SSE',
  is_open BOOLEAN NOT NULL,
  year INT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'tushare',
  PRIMARY KEY (cal_date, exchange)
);

CREATE INDEX IF NOT EXISTS idx_trading_calendar_year ON trading_calendar (year);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_kind TEXT,
  schedule_days INT[],
  run_at_time TEXT NOT NULL DEFAULT '09:00',
  consecutive_failures INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ
);

INSERT INTO scheduled_jobs (job_type, enabled, schedule_kind, schedule_days, run_at_time)
VALUES ('portfolio', FALSE, NULL, NULL, '09:00')
ON CONFLICT (job_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES scheduled_jobs (id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  report_index_id UUID,
  conversation_id UUID,
  failure_reason TEXT,
  skip_reason TEXT,
  as_of_trade_date DATE,
  CONSTRAINT scheduled_job_runs_status_check CHECK (status IN ('success', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_triggered
  ON scheduled_job_runs (job_id, triggered_at DESC);
