"use client";

import type { ReactNode } from "react";
import { ResizableSidebar } from "@/components/layout/ResizableSidebar";
import { ConversationSidebar } from "@/components/layout/ConversationSidebar";
import { OfflineToast } from "@/components/ui/OfflineToast";
import { SettingsStartupProbe } from "@/components/settings/SettingsStartupProbe";
import { ConversationListProvider } from "@/contexts/ConversationListContext";
import { ReadinessProvider } from "@/contexts/ReadinessContext";
import { ScheduleHeartbeat } from "@/components/scheduled/ScheduleHeartbeat";

/** 应用主壳：左侧栏常驻，右侧随路由切换主内容 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReadinessProvider>
      <ScheduleHeartbeat />
      <div className="h-screen flex overflow-hidden">
        <SettingsStartupProbe />
        <OfflineToast />
        <ConversationListProvider>
          <ResizableSidebar>
            <ConversationSidebar />
          </ResizableSidebar>
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white">
            {children}
          </div>
        </ConversationListProvider>
      </div>
    </ReadinessProvider>
  );
}
