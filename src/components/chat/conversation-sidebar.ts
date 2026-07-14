export interface ConversationSummary {

  id: string;

  title: string;

  updated_at: string;

  created_at?: string;

  conversation_type?: string;

  metadata?: {

    pinned?: boolean;

    pinned_at?: string;

    title_customized?: boolean;

    has_unconfirmed?: boolean;

  };

}



/** G3: 侧栏标题搜索（已移除场景快速筛选 CH-09） */

export function filterConversationsBySearch<T extends ConversationSummary>(

  conversations: T[],

  searchQuery: string,

): T[] {

  const q = searchQuery.trim().toLowerCase();

  if (!q) return conversations;

  return conversations.filter((c) => c.title.toLowerCase().includes(q));

}



/** 单置顶优先，非置顶按 updated_at 降序；置顶项按 pinned_at 降序（全局仅一条） */

export function sortConversationsForSidebar<T extends ConversationSummary>(

  conversations: T[],

): T[] {

  return [...conversations].sort((a, b) => {

    const aPinned = a.metadata?.pinned ?? false;

    const bPinned = b.metadata?.pinned ?? false;

    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aTime = aPinned

      ? (a.metadata?.pinned_at ?? a.updated_at)

      : a.updated_at;

    const bTime = bPinned

      ? (b.metadata?.pinned_at ?? b.updated_at)

      : b.updated_at;

    return bTime.localeCompare(aTime);

  });

}



export function prepareSidebarConversations<T extends ConversationSummary>(

  conversations: T[],

  searchQuery: string,

): T[] {

  return filterConversationsBySearch(

    sortConversationsForSidebar(conversations),

    searchQuery,

  );

}

