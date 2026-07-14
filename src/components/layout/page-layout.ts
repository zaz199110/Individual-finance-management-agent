/** 主内容区统一水平内边距（24px），保证页头 / 工具条 / 横幅左缘对齐 */
export const PAGE_PAD_X = "px-6";

export const pageSectionClasses = {
  header: `${PAGE_PAD_X} py-4 border-b border-[rgba(0,0,0,0.1)] flex items-center gap-3 flex-wrap`,
  subheader: `${PAGE_PAD_X} py-2 text-xs text-[#615d59] border-b border-[rgba(0,0,0,0.1)] flex flex-wrap gap-4 items-center`,
  toolbar: `${PAGE_PAD_X} pt-4 pb-4 flex flex-wrap gap-2 items-center border-b border-[rgba(0,0,0,0.1)]`,
  /** 横幅容器：与 header 同宽，避免 mx-6 + px-4 双重缩进 */
  banner: `${PAGE_PAD_X} pt-3`,
  panelToolbar: `${PAGE_PAD_X} py-2 border-b border-[rgba(0,0,0,0.1)] flex gap-2 flex-wrap items-center`,
  content: `${PAGE_PAD_X}`,
  main: "flex-1 p-8 max-w-3xl",
} as const;

export const pageBannerClasses = {
  base: "w-full rounded-lg text-sm",
  info: "w-full rounded-lg border border-[#0075de] bg-[#e8f4fd] px-4 py-2 text-sm",
  warn: "w-full rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-3 text-sm",
  error: "w-full rounded-lg border border-[#e03e3e] bg-[#fef2f2] px-4 py-3 text-sm text-[#e03e3e]",
} as const;
