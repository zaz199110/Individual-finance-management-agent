"use client";

import type { SceneId } from "@/harness/registry/load";
import { settingsPath } from "@/lib/settings/copy";

export interface HandoffBlock {
  type: "handoff_card";
  target_scene: SceneId;
  target_label: string;
  status: "pending" | "accepted" | "dismissed" | "stale";
  handoff_summary?: string;
}

export interface ConfirmCardBlock {
  type: "confirm_card";
  status: "active" | "confirmed" | "dismissed" | "superseded";
  artifact_id: string;
  card_kind: string;
  summary_zh: string;
  card_title?: string;
}

export interface ReportPublishCardBlock {
  type: "report_publish_card";
  status: "active" | "published" | "dismissed";
  report_type: "profile" | "plan" | "portfolio" | "fund";
  goal_constraint_id?: string;
  holdings_version_id?: string;
  fund_code?: string;
  scope?: string;
  report_name: string;
  file_path?: string;
  /** 润色/校验非阻断提示（C 端展示） */
  notice_zh?: string;
}

export type MessageContentBlock =
  | HandoffBlock
  | ConfirmCardBlock
  | ReportPublishCardBlock;

export const SCENE_TABS: Array<{ id: SceneId; label: string }> = [
  { id: "chat", label: "自由问答" },
  { id: "profile", label: "需求梳理" },
  { id: "plan", label: "资产配置" },
  { id: "portfolio", label: "持仓分析" },
  { id: "fund", label: "基金解析" },
];

const DB_SETUP_HINT = `使用前请先到${settingsPath("database")}完成连接检测。`;

export const PLACEHOLDERS: Record<SceneId, string> = {
  chat: "有问题尽管问，发图也可以",
  profile: DB_SETUP_HINT,
  plan: DB_SETUP_HINT,
  portfolio: DB_SETUP_HINT,
  fund: DB_SETUP_HINT,
};

import type { WorkflowTaskItem } from "@/lib/chat/task-progress";

export type { WorkflowTaskItem, WorkflowTaskStatus } from "@/lib/chat/task-progress";

export interface SuggestedAction {
  label: string;
  /** The text to send as a user message when the button is clicked */
  sendText: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  citations?: Array<{ title: string; url: string }>;
  contentBlocks?: MessageContentBlock[];
  /** Quick-action buttons rendered below the message */
  suggestedActions?: SuggestedAction[];
  runId?: string;
  backgroundJobId?: string;
  backgroundRunId?: string;
  workflowTasks?: WorkflowTaskItem[];
  reasoningSummary?: string;
  taskProgressExpanded?: boolean;
  stopped?: boolean;
}

/** @deprecated 使用 WorkflowTaskItem */
export interface StageItem {
  task_key: string;
  label: string;
  status: string;
}
