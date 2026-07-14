"use client";

import { useRouter } from "next/navigation";
import {
  SIDEBAR_NEW_CHAT_BTN,
  sidebarSectionClasses,
} from "@/components/layout/sidebar-layout";
import { createConversationEntry } from "@/lib/chat/conversation-entry";
import { navigateToConversation } from "@/lib/chat/navigate-conversation";

interface SidebarNewChatHeaderProps {
  onNewConversation?: () => void;
}

export function SidebarNewChatHeader({ onNewConversation }: SidebarNewChatHeaderProps) {
  const router = useRouter();

  return (
    <div className={sidebarSectionClasses.header}>
      <button
        type="button"
        onClick={() => {
          if (onNewConversation) {
            onNewConversation();
          } else {
            void createConversationEntry().then((id) => {
              if (id) navigateToConversation(router, id);
            });
          }
        }}
        className={SIDEBAR_NEW_CHAT_BTN}
      >
        + 新对话
      </button>
    </div>
  );
}
