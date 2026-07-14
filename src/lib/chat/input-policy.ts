import type { ReadinessResult } from "@/lib/settings/readiness";
import { settingsPath } from "@/lib/settings/copy";
import type { SceneId } from "@/harness/registry/load";

/** 其他对话正在生成时，当前对话发送按钮应禁用（输入框仍可编辑） */
export function isChatSendBlocked(
  conversationId: string | null,
  activeStreamConversationId: string | null,
): boolean {
  if (!conversationId || !activeStreamConversationId) return false;
  return activeStreamConversationId !== conversationId;
}

/** PRD Q10 — 输入框是否应禁用 */
export function isChatInputBlocked(
  readiness: Pick<ReadinessResult, "models" | "database"> | null,
  activeTab: SceneId,
  options?: { readinessLoading?: boolean },
): boolean {
  if (options?.readinessLoading && !readiness) return true;
  if (!readiness?.models.chat_ready) return true;
  if (activeTab !== "chat" && !readiness.database.ready) return true;
  return false;
}

export function getChatInputPlaceholder(
  readiness: Pick<ReadinessResult, "models" | "database"> | null,
  activeTab: SceneId,
  tabPlaceholders: Record<string, string>,
  options?: { readinessLoading?: boolean },
): string {
  if (options?.readinessLoading && !readiness) {
    return "正在检查助手与数据连接…";
  }
  if (!readiness?.models.chat_ready) {
    return `请先完成${settingsPath("models")}中「日常对话」与「联网搜索」的检测。`;
  }
  if (activeTab !== "chat" && !readiness.database.ready) {
    if (readiness.database.local_managed) {
      return "本地 Supabase 未就绪，请运行 npm run supabase:recover 恢复。";
    }
    return tabPlaceholders[activeTab] ?? "请先完成个人数据空间连接。";
  }
  if (activeTab === "chat") return "有问题尽管问，发图也可以";
  return "该功能还在完善中，您也可以先在「自由问答」里提问。";
}

/** 未完成选择时的 `/` 后命令 token（不含空格） */
export function getSlashCommandToken(input: string): string | null {
  if (!input.startsWith("/")) return null;
  const rest = input.slice(1);
  if (rest.includes(" ")) return null;
  return rest;
}

/** PRD Q12 — `/` 补全过滤（与 ChatShell 一致） */
export function filterSlashCommands<T extends { id: string }>(
  commands: T[],
  input: string,
): T[] {
  const token = getSlashCommandToken(input);
  if (token === null) return [];
  const q = token.toLowerCase();
  return commands.filter((c) => !q || c.id.toLowerCase().includes(q));
}

/** 点选 / Enter 插入格式 */
export function formatSlashCommandInsert(commandId: string): string {
  return `/${commandId} `;
}

export function clampSlashHighlightIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function stepSlashHighlightIndex(
  index: number,
  count: number,
  direction: "up" | "down",
): number {
  const delta = direction === "down" ? 1 : -1;
  return clampSlashHighlightIndex(index + delta, count);
}

/** 输入是否已完成 `/commandId` 选择（含尾部空格，可继续写自然语言） */
export function isSlashCommandSelected(
  input: string,
  commands: Array<{ id: string }>,
): boolean {
  if (!input.startsWith("/")) return false;
  const rest = input.slice(1);
  const spaceIdx = rest.indexOf(" ");
  if (spaceIdx < 0) return false;
  const cmdToken = rest.slice(0, spaceIdx).toLowerCase();
  return commands.some((c) => c.id.toLowerCase() === cmdToken);
}

/**
 * CH-27 — `/` 补全菜单是否应显示。
 * 单一数据源：由 input + 当前 Tab 命令列表推导，不用独立 boolean。
 */
export function shouldShowSlashMenu(
  input: string,
  commands: Array<{ id: string }>,
): boolean {
  if (!input.startsWith("/")) return false;
  if (isSlashCommandSelected(input, commands)) return false;
  const token = getSlashCommandToken(input);
  if (token === null) return false;
  const filtered = filterSlashCommands(commands, input);
  if (filtered.length === 0) return false;
  if (
    filtered.length === 1 &&
    token.toLowerCase() === filtered[0].id.toLowerCase()
  ) {
    return false;
  }
  return true;
}

/** Esc 关闭菜单：去掉 `/` 前缀，保留已输入文字 */
export function dismissSlashMenuInput(input: string): string {
  if (!input.startsWith("/")) return input;
  const token = getSlashCommandToken(input);
  if (token === null) return input;
  return token;
}
