import type { SidebarNavActive } from "@/components/layout/SidebarNavFooter";

export function resolveSidebarActive(pathname: string): SidebarNavActive {
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/fund-knowledge")) return "fund-knowledge";
  if (pathname.startsWith("/scheduled-jobs")) return "scheduled-jobs";
  if (pathname.startsWith("/settings")) return "settings";
  return "chat";
}

/** 全局导航链接保留当前 ?c= 对话上下文 */
export function appendConversationQuery(
  path: string,
  conversationId: string | null | undefined,
): string {
  if (!conversationId) return path;
  const qIndex = path.indexOf("?");
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const params = new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : "");
  params.set("c", conversationId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
