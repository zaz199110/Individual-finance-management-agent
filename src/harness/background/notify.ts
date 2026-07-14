import type { SseEventType } from "@/harness/types";
import type { JobDonePayload } from "./types";

type JobDoneListener = (payload: JobDonePayload) => void;

export type JobStreamEvent = Extract<
  SseEventType,
  "stage" | "progress" | "reasoning_summary" | "token_delta" | "content_block"
>;

export interface JobStagePayload {
  job_id: string;
  event: JobStreamEvent;
  data: unknown;
}

type JobStageListener = (payload: JobStagePayload) => void;

const listeners = new Map<string, Set<JobDoneListener>>();
const stageListeners = new Map<string, Set<JobStageListener>>();

/** 进程内订阅（同会话 SSE 仍连接时可即时推送 job_done） */
export function subscribeJobDone(
  conversationId: string,
  listener: JobDoneListener,
): () => void {
  let set = listeners.get(conversationId);
  if (!set) {
    set = new Set();
    listeners.set(conversationId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(conversationId);
  };
}

export function emitJobDone(payload: JobDonePayload): void {
  const set = listeners.get(payload.conversation_id);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error("[emitJobDone listener]", err);
    }
  }
}

/** 进程内订阅（后台 job 阶段条 → 仍连接的 SSE 转发） */
export function subscribeJobStage(
  conversationId: string,
  listener: JobStageListener,
): () => void {
  let set = stageListeners.get(conversationId);
  if (!set) {
    set = new Set();
    stageListeners.set(conversationId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) stageListeners.delete(conversationId);
  };
}

export function emitJobStage(
  conversationId: string,
  payload: JobStagePayload,
): void {
  const set = stageListeners.get(conversationId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error("[emitJobStage listener]", err);
    }
  }
}
