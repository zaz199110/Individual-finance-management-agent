import type { ChatMessage } from "@/components/chat/types";

export type ActiveStreamSession = {
  conversationId: string;
  assistantId: string;
  abortController: AbortController;
};

let session: ActiveStreamSession | null = null;
const liveBuffers = new Map<string, ChatMessage[]>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeActiveStream(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getActiveStreamSession(): ActiveStreamSession | null {
  return session;
}

export function getActiveStreamConversationId(): string | null {
  return session?.conversationId ?? null;
}

export function isStreamActive(): boolean {
  return session !== null;
}

export function isStreamOwner(conversationId: string): boolean {
  return session?.conversationId === conversationId;
}

/** 其他对话正在生成，当前对话不可发送 */
export function isSendBlockedForConversation(conversationId: string): boolean {
  return session !== null && session.conversationId !== conversationId;
}

export function canStartStream(conversationId: string): boolean {
  return session === null || session.conversationId === conversationId;
}

export function startStreamSession(
  conversationId: string,
  assistantId: string,
  abortController: AbortController,
): void {
  session = { conversationId, assistantId, abortController };
  notifyListeners();
}

export function finishStreamSession(conversationId: string): void {
  if (session?.conversationId === conversationId) {
    session = null;
    notifyListeners();
  }
}

export function abortActiveStream(): void {
  session?.abortController.abort();
}

export function getLiveStreamBuffer(conversationId: string): ChatMessage[] | null {
  const buf = liveBuffers.get(conversationId);
  return buf ?? null;
}

export function setLiveStreamBuffer(
  conversationId: string,
  messages: ChatMessage[],
): void {
  liveBuffers.set(conversationId, messages);
}

export function patchLiveStreamBuffer(
  conversationId: string,
  patch: (prev: ChatMessage[]) => ChatMessage[],
  initial?: ChatMessage[],
): ChatMessage[] {
  const prev = liveBuffers.get(conversationId) ?? initial ?? [];
  const next = patch(prev);
  liveBuffers.set(conversationId, next);
  return next;
}

export function clearLiveStreamBuffer(conversationId: string): void {
  liveBuffers.delete(conversationId);
}

/** @internal test helper */
export function resetActiveStreamState(): void {
  session = null;
  liveBuffers.clear();
  listeners.clear();
}
