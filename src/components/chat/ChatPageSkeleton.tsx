"use client";

import {
  CHAT_ASSISTANT_MESSAGE_WIDTH,
  CHAT_USER_MESSAGE_WIDTH,
} from "@/components/chat/chat-layout";

/** Suspense 占位：与 ChatShell 布局一致，避免整页白屏后再闪现 */
export function ChatPageSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden animate-pulse">
      <aside className="hidden sm:flex w-[260px] shrink-0 flex-col border-r border-[rgba(0,0,0,0.08)] bg-[#fafafa]">
        <div className="h-14 border-b border-[rgba(0,0,0,0.06)] mx-3 my-2 rounded-lg bg-[#e5e7eb]" />
        <div className="px-3 pb-2">
          <div className="h-9 rounded-lg bg-[#e5e7eb]" />
        </div>
        <div className="flex-1 space-y-2 px-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-[#e5e7eb]" />
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-8 space-y-4 max-w-[768px] mx-auto w-full">
            <div className={`h-16 rounded-2xl bg-[#f6f5f4] ${CHAT_ASSISTANT_MESSAGE_WIDTH}`} />
            <div className={`h-24 rounded-2xl bg-[#0075de]/20 ml-auto ${CHAT_USER_MESSAGE_WIDTH}`} />
          </div>
        </div>
        <div className="shrink-0 max-w-[768px] mx-auto w-full px-4 pb-4">
          <div className="h-24 rounded-xl bg-[#f6f5f4]" />
        </div>
      </main>
    </div>
  );
}
