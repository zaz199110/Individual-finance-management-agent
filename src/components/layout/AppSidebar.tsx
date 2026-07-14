"use client";

import { useRouter } from "next/navigation";
import { ResizableSidebar } from "@/components/layout/ResizableSidebar";
import { SidebarNavFooter } from "@/components/layout/SidebarNavFooter";
import { SidebarNewChatHeader } from "@/components/layout/SidebarNewChatHeader";
import {
  sidebarConversationItemClass,
  sidebarSectionClasses,
} from "@/components/layout/sidebar-layout";
import { CONVERSATION_TITLE_LINE_CLAMP_CLASS } from "@/lib/chat/user-content";
import { navigateToConversation } from "@/lib/chat/navigate-conversation";

export interface ConversationSummary {
  id: string;
  title: string;
  metadata?: { has_unconfirmed?: boolean; pinned?: boolean };
}

interface AppSidebarProps {
  active: "chat" | "reports" | "fund-knowledge" | "scheduled-jobs" | "settings";
  conversationId?: string | null;
  conversations?: ConversationSummary[];
  reportsHref?: string;
  fundKnowledgeHref?: string;
  onNewConversation?: () => void;
}

export function AppSidebar({
  active,
  conversationId,
  conversations = [],
  reportsHref = "/reports",
  fundKnowledgeHref = "/fund-knowledge",
  onNewConversation,
}: AppSidebarProps) {
  const router = useRouter();

  return (
    <ResizableSidebar>
      <SidebarNewChatHeader onNewConversation={onNewConversation} />

      <div className={sidebarSectionClasses.scroll}>
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigateToConversation(router, c.id)}
            className={`${sidebarConversationItemClass(active === "chat" && c.id === conversationId)} flex items-center`}
          >
            <span className={CONVERSATION_TITLE_LINE_CLAMP_CLASS}>
              {c.metadata?.pinned && (
                <span className="inline-block mr-1 text-[#0075de]">📌</span>
              )}
              {c.metadata?.has_unconfirmed && (
                <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] mr-2" />
              )}
              {c.title}
            </span>
          </button>
        ))}
      </div>

      <SidebarNavFooter
        active={active}
        reportsHref={reportsHref}
        fundKnowledgeHref={fundKnowledgeHref}
      />
    </ResizableSidebar>
  );
}
