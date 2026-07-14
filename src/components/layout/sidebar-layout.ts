/** 侧栏统一水平内边距（12px），保证「新对话 / 搜索 / 列表 / 底部导航」左缘对齐 */
export const SIDEBAR_PAD_X = "px-3";

export const sidebarSectionClasses = {
  header: `${SIDEBAR_PAD_X} py-3 border-b border-[rgba(0,0,0,0.1)]`,
  search: `${SIDEBAR_PAD_X} py-2`,
  scroll: `${SIDEBAR_PAD_X} py-1 flex-1 overflow-y-auto space-y-1 min-h-0`,
  footer: `${SIDEBAR_PAD_X} py-3 border-t border-[rgba(0,0,0,0.1)] space-y-1`,
} as const;

export const SIDEBAR_NEW_CHAT_BTN =
  "w-full rounded-lg bg-[#0075de] text-white py-2 font-semibold text-[15px] border-0 cursor-pointer";

export const SIDEBAR_SEARCH_INPUT =
  "w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0075de] transition-colors";

export function sidebarNavLinkClass(active: boolean): string {
  return `block w-full text-left text-[15px] rounded-lg px-2 py-2 border-0 cursor-pointer no-underline hover:no-underline font-semibold text-[rgba(0,0,0,0.95)] ${
    active ? "bg-[#f6f5f4]" : "hover:bg-[#f6f5f4] bg-transparent"
  }`;
}

export function sidebarConversationItemClass(active: boolean): string {
  return `w-full text-left rounded-lg px-2 py-2 text-[13px] border-0 cursor-pointer ${
    active ? "bg-[#f6f5f4] font-semibold" : "bg-transparent hover:bg-[#f6f5f4]"
  }`;
}

/** 对话列表行：右键打开操作菜单；单行时垂直居中，多行时随内容增高 */
export const SIDEBAR_CONVERSATION_ROW = "rounded-lg min-h-9 flex items-center";

export const SIDEBAR_CONVERSATION_TITLE_BTN =
  "w-full min-w-0 text-left px-2 py-1.5 text-[13px] leading-snug border-0 bg-transparent cursor-pointer flex items-center";
