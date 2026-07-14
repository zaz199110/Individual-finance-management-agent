"use client";

import { useSyncExternalStore } from "react";
import {
  getActiveStreamConversationId,
  isSendBlockedForConversation,
  isStreamOwner,
  subscribeActiveStream,
} from "@/lib/chat/active-stream";

export function useActiveStreamConversationId(): string | null {
  return useSyncExternalStore(
    subscribeActiveStream,
    getActiveStreamConversationId,
    () => null,
  );
}

export function useIsStreamOwner(conversationId: string | null): boolean {
  const activeId = useActiveStreamConversationId();
  return Boolean(conversationId && activeId === conversationId);
}

export function useIsSendBlocked(conversationId: string | null): boolean {
  const activeId = useActiveStreamConversationId();
  if (!conversationId || !activeId) return false;
  return isSendBlockedForConversation(conversationId);
}

export function useIsStreamingElsewhere(conversationId: string | null): boolean {
  const activeId = useActiveStreamConversationId();
  if (!conversationId || !activeId) return false;
  return activeId !== conversationId;
}

export { isStreamOwner, isSendBlockedForConversation };
