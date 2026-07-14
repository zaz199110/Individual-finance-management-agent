"use client";

import Link from "next/link";
import { UsageGuideTrigger } from "@/components/usage/UsageGuideDrawer";
import {
  sidebarNavLinkClass,
  sidebarSectionClasses,
} from "@/components/layout/sidebar-layout";

export type SidebarNavActive =
  | "chat"
  | "reports"
  | "fund-knowledge"
  | "scheduled-jobs"
  | "settings";

interface SidebarNavFooterProps {
  active: SidebarNavActive;
  conversationId?: string | null;
  reportsHref?: string;
  fundKnowledgeHref?: string;
  scheduledJobsHref?: string;
  settingsHref?: string;
}

/** 侧栏底部五项导航（无「全局」分组，样式一致） */
export function SidebarNavFooter({
  active,
  reportsHref = "/reports",
  fundKnowledgeHref = "/fund-knowledge",
  scheduledJobsHref = "/scheduled-jobs",
  settingsHref = "/settings/models",
}: SidebarNavFooterProps) {
  return (
    <div className={sidebarSectionClasses.footer}>
      <Link href={reportsHref} className={sidebarNavLinkClass(active === "reports")}>
        我的报告
      </Link>
      <Link
        href={scheduledJobsHref}
        className={sidebarNavLinkClass(active === "scheduled-jobs")}
      >
        定时持仓分析
      </Link>
      <Link
        href={fundKnowledgeHref}
        className={sidebarNavLinkClass(active === "fund-knowledge")}
      >
        基金知识库
      </Link>
      <UsageGuideTrigger className={sidebarNavLinkClass(false)} />
      <Link href={settingsHref} className={sidebarNavLinkClass(active === "settings")}>
        设置
      </Link>
    </div>
  );
}
