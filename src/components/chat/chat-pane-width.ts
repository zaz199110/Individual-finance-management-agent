export const CHAT_PANE_WIDTH_KEY = "agent-demo:rpt-chat-pane-width";
export const CHAT_PANE_MIN_WIDTH = 280;
export const CHAT_PANE_MAX_WIDTH = 800;
/** 模式 B 右侧聊天列默认宽度（RPT-SPLIT-01） */
export const CHAT_PANE_DEFAULT_WIDTH = 560;

export function clampChatPaneWidth(width: number): number {
  return Math.min(CHAT_PANE_MAX_WIDTH, Math.max(CHAT_PANE_MIN_WIDTH, width));
}

export function readChatPaneWidth(): number {
  if (typeof window === "undefined") return CHAT_PANE_DEFAULT_WIDTH;
  const raw = localStorage.getItem(CHAT_PANE_WIDTH_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? clampChatPaneWidth(n) : CHAT_PANE_DEFAULT_WIDTH;
}

export function writeChatPaneWidth(width: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAT_PANE_WIDTH_KEY, String(clampChatPaneWidth(width)));
}
