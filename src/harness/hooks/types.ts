import type { SceneId } from "@/harness/registry/load";

export type HookEvent =
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop";

export interface HookContext {
  event: HookEvent;
  conversationId: string;
  runId: string;
  scene: SceneId;
  userMessage?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResultPreview?: string;
}

export interface HookResult {
  reminders?: string[];
  blocked?: boolean;
  blockReason?: string;
}
