/** 清洗用户输入，避免 undefined 等脏数据进入消息与标题 */
export function sanitizeUserContent(raw: string): string {
  let s = String(raw ?? "").trim();
  if (s === "undefined") return "";
  if (s.startsWith("undefined")) {
    s = s.slice("undefined".length).trim();
  }
  return s;
}

/** 侧栏对话标题展示：最多 4 行（须用于 block 元素，勿直接加在 button 上） */
export const CONVERSATION_TITLE_LINE_CLAMP_CLASS =
  "block min-w-0 line-clamp-4 break-words whitespace-normal leading-normal";
