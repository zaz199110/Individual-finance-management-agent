export type BackgroundJobType = "deep_report" | "deep_analysis" | "scheduled";

export type BackgroundJobStatus =
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface BackgroundJobRow {
  id: string;
  conversation_id: string;
  run_id: string;
  job_type: BackgroundJobType;
  status: BackgroundJobStatus;
  created_at: string;
  finished_at: string | null;
}

export interface JobDonePayload {
  job_id: string;
  conversation_id: string;
  run_id: string;
  job_type: BackgroundJobType;
  status: "done" | "failed" | "cancelled";
  message_id?: string;
  summary?: string;
  error?: string;
}
