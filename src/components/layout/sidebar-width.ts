export const SIDEBAR_WIDTH_KEY = "sidebar_width_px";
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 600;
/** 默认宽度需容纳「【场景】- 摘要 - 日期」单行展示（含 hover 操作按钮） */
export const SIDEBAR_DEFAULT_WIDTH = 320;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export function readSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_WIDTH;
}

export function writeSidebarWidth(width: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
}
