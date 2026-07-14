"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { SceneId } from "@/harness/registry/load";
import { writeConversationsList } from "@/lib/chat/chat-session-cache";
import { useCachedConversationsList } from "@/lib/chat/use-chat-session-cache";

export interface AppConversationSummary {
  id: string;
  title: string;
  conversation_type: SceneId;
  created_at?: string;
  metadata: {
    type_locked?: boolean;
    active_tab?: SceneId;
    has_unconfirmed?: boolean;
    pinned?: boolean;
    pinned_at?: string;
    title_customized?: boolean;
  };
  updated_at: string;
}

interface ConversationListContextValue {
  conversations: AppConversationSummary[];
  setConversations: React.Dispatch<React.SetStateAction<AppConversationSummary[]>>;
  refreshConversations: () => Promise<void>;
  conversationId: string | null;
  loadingConversations: boolean;
}

const ConversationListContext = createContext<ConversationListContextValue | null>(
  null,
);

export function ConversationListProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");
  const cachedList = useCachedConversationsList();

  const [conversations, setConversations] = useState<AppConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const cachedListSyncedRef = useRef(false);

  useLayoutEffect(() => {
    if (cachedList.length > 0 && !cachedListSyncedRef.current) {
      setConversations(cachedList as AppConversationSummary[]);
      cachedListSyncedRef.current = true;
    }
  }, [cachedList]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations?limit=30");
      const data = (await res.json()) as {
        conversations?: AppConversationSummary[];
      };
      const list = data.conversations ?? [];
      setConversations(list);
      writeConversationsList(list);
    } catch {
      /* ignore background refresh errors */
    }
  }, []);

  useEffect(() => {
    const hasCachedList = cachedList.length > 0 || conversations.length > 0;
    if (!hasCachedList) setLoadingConversations(true);
    void refreshConversations().finally(() => setLoadingConversations(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  const value: ConversationListContextValue = {
    conversations,
    setConversations,
    refreshConversations,
    conversationId,
    loadingConversations,
  };

  return (
    <ConversationListContext.Provider value={value}>
      {children}
    </ConversationListContext.Provider>
  );
}

export function useConversationList(): ConversationListContextValue {
  const ctx = useContext(ConversationListContext);
  if (!ctx) {
    throw new Error("useConversationList must be used within ConversationListProvider");
  }
  return ctx;
}
