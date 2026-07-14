"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage } from "@/components/chat/types";
import type { SceneId } from "@/harness/registry/load";
import {
  getCachedConversationSnapshot,
  getCachedConversations,
  subscribeChatSessionCache,
  type CachedConversationListItem,
} from "@/lib/chat/chat-session-cache";

const EMPTY_BOOTSTRAP: {
  messages: ChatMessage[];
  activeTab: SceneId;
  hasSnapshot: boolean;
} = { messages: [], activeTab: "chat", hasSnapshot: false };

let cachedBootstrapKey = "";
let cachedBootstrapValue: typeof EMPTY_BOOTSTRAP = EMPTY_BOOTSTRAP;

function getConversationBootstrap(conversationId: string | null): typeof EMPTY_BOOTSTRAP {
  const snap = conversationId ? getCachedConversationSnapshot(conversationId) : null;
  const nextKey = snap
    ? `${conversationId}:${snap.cachedAt}`
    : `${conversationId ?? ""}:empty`;
  if (nextKey === cachedBootstrapKey) return cachedBootstrapValue;
  cachedBootstrapKey = nextKey;
  cachedBootstrapValue = snap
    ? { messages: snap.messages, activeTab: snap.activeTab, hasSnapshot: true }
    : EMPTY_BOOTSTRAP;
  return cachedBootstrapValue;
}

export function useCachedConversationsList(): CachedConversationListItem[] {
  return useSyncExternalStore(
    subscribeChatSessionCache,
    getCachedConversations,
    getCachedConversations,
  );
}

export function useCachedConversationBootstrap(conversationId: string | null): {
  messages: ChatMessage[];
  activeTab: SceneId;
  hasSnapshot: boolean;
} {
  return useSyncExternalStore(
    subscribeChatSessionCache,
    () => getConversationBootstrap(conversationId),
    () => EMPTY_BOOTSTRAP,
  );
}
