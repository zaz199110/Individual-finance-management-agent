-- Migration 015: scheduled_job_runs 补 FK 约束
ALTER TABLE scheduled_job_runs
  ADD CONSTRAINT fk_scheduled_job_runs_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE SET NULL;

ALTER TABLE scheduled_job_runs
  ADD CONSTRAINT fk_scheduled_job_runs_report
    FOREIGN KEY (report_index_id) REFERENCES report_index(id)
    ON DELETE SET NULL;
