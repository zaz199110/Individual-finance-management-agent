import type { SceneId } from "@/harness/registry/load";

export type Intent = "simple_qa" | "scene_task" | "cross_scene_handoff";

export interface ExecutionPlanStep {
  key: string;
  label: string;
  skill?: string;
  command?: string;
  status: "pending" | "running" | "done" | "blocked" | "cancelled";
}

export interface ExecutionPlan {
  intent: Intent;
  target_scene?: SceneId;
  steps: ExecutionPlanStep[];
  requires_user_confirm: boolean;
  reasoning_summary?: string;
}

export interface ChatAttachment {
  type: "image";
  url?: string;
  /** D2: base64 编码的图片数据（前端上传时使用） */
  data?: string;
  /** D2: MIME 类型（配合 data 使用，如 "image/png"） */
  mime?: string;
}

export interface ChatStreamRequest {
  conversation_id: string;
  content?: string;
  attachments?: ChatAttachment[];
  scene: SceneId;
  trigger?: "handoff_autostart" | "edit_resend";
  target_scene?: SceneId;
  handoff_summary?: string;
  source_conversation_id?: string;
  handoff_card_message_id?: string;
  /** CH-17：编辑再发时跳过重复 persist user */
  edit_resend_message_id?: string;
}

export interface ConversationMetadata {
  type_locked: boolean;
  active_tab: SceneId;
  has_unconfirmed: boolean;
  pinned?: boolean;
  pinned_at?: string | null;
  title_customized?: boolean;
  pending_report_draft?: unknown;
  pending_artifact_ids?: string[];
  report_overlay?: unknown;
}

export interface ConversationRow {
  id: string;
  title: string;
  conversation_type: SceneId;
  metadata: ConversationMetadata;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string | null;
  attachments?: ChatAttachment[] | null;
  metadata?: Record<string, unknown> | null;
  citations?: unknown[] | null;
  created_at: string;
}

export interface QueryState {
  runId: string;
  conversationId: string;
  conversationType: SceneId;
  scene: SceneId;
  messages: MessageRow[];
  plan: ExecutionPlan | null;
  attachments?: ChatAttachment[];
  trigger?: string;
  handoffSummary?: string;
  sourceConversationId?: string;
  handoffCardMessageId?: string;
  abortSignal?: AbortSignal;
  /** Router 层注入（如 report_read） */
  promptReminders?: string[];
}

export type SseEventType =
  | "stage"
  | "progress"
  | "reasoning_summary"
  | "content_block"
  | "handoff_ready"
  | "job_done"
  | "token_delta"
  | "conversation_title"
  | "user_persisted"
  | "stopped"
  | "error"
  | "done";

export interface SseWriter {
  write(event: SseEventType, data: unknown): void;
  close(): void;
}

export interface ContentBlockText {
  type: "text";
  text: string;
}

export interface ContentBlockHandoff {
  type: "handoff_card";
  target_scene: SceneId;
  target_label: string;
  status: "pending" | "accepted" | "dismissed" | "stale";
}

export interface ContentBlockConfirmCard {
  type: "confirm_card";
  status: "active" | "confirmed" | "dismissed" | "superseded";
  artifact_id: string;
  card_kind: string;
  summary_zh: string;
  card_title?: string;
}

export interface ContentBlockReportPublish {
  type: "report_publish_card";
  status: "active" | "published" | "dismissed";
  report_type: "profile" | "plan" | "portfolio" | "fund";
  goal_constraint_id?: string;
  holdings_version_id?: string;
  fund_code?: string;
  scope?: string;
  report_name: string;
  file_path?: string;
}

export type ContentBlock =
  | ContentBlockText
  | ContentBlockHandoff
  | ContentBlockConfirmCard
  | ContentBlockReportPublish;
