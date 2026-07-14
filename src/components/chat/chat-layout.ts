/** 模式 A：侧栏 + 主聊天区（无右侧固定栏） */

export const CHAT_MODE_A_MAIN =

  "flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-white";



/** 模式 A 内聊天列：全宽 flex 列，滚动由 scroll 区承担 */

export const CHAT_MODE_A_COLUMN =

  "flex flex-col min-h-0 h-full w-full overflow-hidden";



/** 模式 A 可滚动主区（滚动条贴主区右缘） */

export const CHAT_MODE_A_SCROLL =

  "relative flex-1 min-h-0 overflow-y-auto";



/** 模式 A 内 768px 居中的正文/输入内容区 */

export const CHAT_MODE_A_CONTENT =

  "w-full max-w-[768px] mx-auto px-4";



/** 助手消息气泡：固定最大宽，避免短回复铺满内容区 */

export const CHAT_ASSISTANT_MESSAGE_WIDTH = "w-full max-w-[640px]";



/** 用户消息气泡：右对齐、随内容收缩 */

export const CHAT_USER_MESSAGE_WIDTH = "max-w-[85%]";



/** 模式 B：侧栏 + 报告预览 + 右侧聊天列 */

export const CHAT_MODE_B_MAIN =

  "flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden bg-white";



/** 模式 B 右侧聊天列（宽度由 ResizableChatPane + chat-pane-width 控制） */

export const CHAT_MODE_B_CHAT_PANE =

  "border-l border-[rgba(0,0,0,0.1)] bg-white";



/** 模式 B 聊天列内层：占满固定宽列，不再居中缩进 */

export const CHAT_MODE_B_CHAT_INNER =

  "flex flex-col min-h-0 h-full w-full overflow-hidden";



export function chatMainClass(isModeB: boolean): string {

  return isModeB ? CHAT_MODE_B_MAIN : CHAT_MODE_A_MAIN;

}



export function chatColumnOuterClass(isModeB: boolean): string {

  return isModeB ? CHAT_MODE_B_CHAT_PANE : "flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden";

}



export function chatColumnInnerClass(isModeB: boolean): string {

  return isModeB ? CHAT_MODE_B_CHAT_INNER : CHAT_MODE_A_COLUMN;

}



export function chatScrollAreaClass(isModeB: boolean): string {

  return isModeB

    ? "relative flex-1 min-h-0 overflow-y-auto flex flex-col"

    : CHAT_MODE_A_SCROLL;

}



export function chatScrollBodyClass(isModeB: boolean): string {

  return isModeB

    ? "flex flex-col min-h-0 flex-1 px-4 py-6"

    : `${CHAT_MODE_A_CONTENT} py-6 min-h-full flex flex-col`;

}



export function chatFooterWrapClass(isModeB: boolean): string {

  return isModeB

    ? "shrink-0 px-4 pt-2 pb-4 space-y-3"

    : `shrink-0 pt-2 pb-4 space-y-3 ${CHAT_MODE_A_CONTENT}`;

}


