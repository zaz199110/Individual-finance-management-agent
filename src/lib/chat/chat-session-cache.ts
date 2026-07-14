import type { ChatMessage } from "@/components/chat/types";
import type { SceneId } from "@/harness/registry/load";

const STORAGE_KEY = "agent-demo.chat-session.v1";
const MAX_SNAPSHOTS = 20;

export interface CachedConversationListItem {
  id: string;
  title: string;
  conversation_type: SceneId;
  created_at?: string;
  updated_at: string;
  metadata: {
    type_locked?: boolean;
    active_tab?: SceneId;
    has_unconfirmed?: boolean;
    pinned?: boolean;
    pinned_at?: string;
    title_customized?: boolean;
  };
}

export interface CachedConversationSnapshot {
  messages: ChatMessage[];
  activeTab: SceneId;
  cachedAt: number;
}

interface ChatSessionCache {
  conversations: CachedConversationListItem[];
  snapshots: Record<string, CachedConversationSnapshot>;
}

const EMPTY_CONVERSATIONS: CachedConversationListItem[] = [];
const EMPTY_SNAPSHOTS: Record<string, CachedConversationSnapshot> = {};

let memoryCache: ChatSessionCache = {
  conversations: EMPTY_CONVERSATIONS,
  snapshots: EMPTY_SNAPSHOTS,
};
/** Tracks last raw sessionStorage payload so reads return stable references. */
let lastStorageRaw: string | null | undefined;

const cacheListeners = new Set<() => void>();

function notifyCacheListeners(): void {
  for (const listener of cacheListeners) {
    listener();
  }
}

export function subscribeChatSessionCache(onStoreChange: () => void): () => void {
  cacheListeners.add(onStoreChange);
  return () => {
    cacheListeners.delete(onStoreChange);
  };
}

function emptyCache(): ChatSessionCache {
  return { conversations: EMPTY_CONVERSATIONS, snapshots: EMPTY_SNAPSHOTS };
}

function hasSessionStorage(): boolean {
  return typeof globalThis.sessionStorage !== "undefined";
}

function readRawCache(): ChatSessionCache {
  if (!hasSessionStorage()) return memoryCache;
  const raw = globalThis.sessionStorage.getItem(STORAGE_KEY);
  if (raw === lastStorageRaw) return memoryCache;
  lastStorageRaw = raw;
  if (!raw) {
    memoryCache = emptyCache();
    return memoryCache;
  }
  try {
    const parsed = JSON.parse(raw) as ChatSessionCache;
    if (!parsed || typeof parsed !== "object") {
      memoryCache = emptyCache();
      return memoryCache;
    }
    memoryCache = {
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations
        : EMPTY_CONVERSATIONS,
      snapshots:
        parsed.snapshots && typeof parsed.snapshots === "object"
          ? parsed.snapshots
          : EMPTY_SNAPSHOTS,
    };
  } catch {
    memoryCache = emptyCache();
  }
  return memoryCache;
}

function writeRawCache(cache: ChatSessionCache): void {
  memoryCache = cache;
  if (!hasSessionStorage()) {
    notifyCacheListeners();
    return;
  }
  try {
    const raw = JSON.stringify(cache);
    globalThis.sessionStorage.setItem(STORAGE_KEY, raw);
    lastStorageRaw = raw;
  } catch {
    /* quota or private mode — ignore */
  }
  notifyCacheListeners();
}

function sanitizeMessagesForCache(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({ streaming: _streaming, ...rest }) => rest);
}

function trimSnapshots(snapshots: Record<string, CachedConversationSnapshot>): Record<string, CachedConversationSnapshot> {
  const entries = Object.entries(snapshots).sort(
    (a, b) => b[1].cachedAt - a[1].cachedAt,
  );
  return Object.fromEntries(entries.slice(0, MAX_SNAPSHOTS));
}

export function getCachedConversations(): CachedConversationListItem[] {
  return readRawCache().conversations;
}

export function resolveConversationActiveTab(
  conv: Pick<CachedConversationListItem, "conversation_type" | "metadata">,
): SceneId {
  return conv.metadata?.type_locked
    ? conv.conversation_type
    : (conv.metadata?.active_tab ?? "chat");
}

export function findConversationTabHint(
  conversationId: string,
  list: CachedConversationListItem[],
): SceneId | null {
  const summary = list.find((c) => c.id === conversationId);
  return summary ? resolveConversationActiveTab(summary) : null;
}

export function getCachedConversationSnapshot(
  conversationId: string,
): CachedConversationSnapshot | null {
  return readRawCache().snapshots[conversationId] ?? null;
}

export function writeConversationsList(conversations: CachedConversationListItem[]): void {
  const cache = readRawCache();
  cache.conversations = conversations;
  writeRawCache(cache);
}

export function writeConversationSnapshot(
  conversationId: string,
  snapshot: { messages: ChatMessage[]; activeTab: SceneId },
): void {
  const cache = readRawCache();
  cache.snapshots[conversationId] = {
    messages: sanitizeMessagesForCache(snapshot.messages),
    activeTab: snapshot.activeTab,
    cachedAt: Date.now(),
  };
  cache.snapshots = trimSnapshots(cache.snapshots);
  writeRawCache(cache);
}
