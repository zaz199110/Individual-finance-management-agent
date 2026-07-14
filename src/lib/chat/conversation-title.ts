import type { SceneId } from "@/harness/registry/load";

/** 侧栏对话标题中的场景前缀（对客展示） */
export const CONVERSATION_TITLE_SCENE_LABELS: Record<SceneId, string> = {
  chat: "自由问答",
  profile: "需求梳理",
  plan: "资产配置",
  portfolio: "持仓分析",
  fund: "基金解析",
};

const STRUCTURED_TITLE_RE = /^【([^】]+)】-(.+)-(\d{8})$/;

export interface ParsedConversationTitle {
  sceneLabel: string;
  summary: string;
  date: string;
}

export function formatConversationDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 首条用户问题摘要（≤20 字，不含 `-` 以免破坏标题结构） */
export function summarizeFirstQuestion(content: string, maxLen = 20): string {
  const cleaned = content
    .replace(/\s+/g, " ")
    .trim()
    .replace(/-/g, " ")
    .replace(/[【】]/g, "");
  if (!cleaned) return "未命名对话";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export function buildConversationTitle(
  scene: SceneId,
  summary: string,
  date: string,
): string {
  const safeSummary = summary.replace(/-/g, " ").trim() || "未命名对话";
  const label = CONVERSATION_TITLE_SCENE_LABELS[scene];
  return `【${label}】-${safeSummary}-${date}`;
}

export function parseConversationTitle(title: string): ParsedConversationTitle | null {
  const match = title.match(STRUCTURED_TITLE_RE);
  if (!match) return null;
  return {
    sceneLabel: match[1],
    summary: match[2],
    date: match[3],
  };
}

export function isStructuredConversationTitle(title: string): boolean {
  if (!title) return false;
  return STRUCTURED_TITLE_RE.test(title);
}

/** 是否仍为系统默认标题，可在首条消息后自动命名 */
export function isAutoTitleCandidate(title: string): boolean {
  if (!title || title === "新对话") return true;
  if (/ · 新对话$/.test(title)) return true;
  if (title.startsWith("定时持仓分析")) return false;
  return !isStructuredConversationTitle(title);
}

export function getRenameDraft(title: string): {
  structured: boolean;
  draft: string;
  parsed: ParsedConversationTitle | null;
} {
  const parsed = parseConversationTitle(title);
  if (parsed) {
    return { structured: true, draft: parsed.summary, parsed };
  }
  return { structured: false, draft: title, parsed: null };
}

export function commitRenameTitle(
  currentTitle: string,
  draft: string,
  scene?: SceneId,
  createdAt?: string,
): string {
  const trimmed = draft.trim();
  if (!trimmed) return currentTitle;

  const { structured, parsed } = getRenameDraft(currentTitle);
  if (structured && parsed) {
    const safeSummary = trimmed.replace(/-/g, " ").trim();
    return `【${parsed.sceneLabel}】-${safeSummary}-${parsed.date}`;
  }

  if (scene && createdAt) {
    return buildConversationTitle(
      scene,
      summarizeFirstQuestion(trimmed),
      formatConversationDate(createdAt),
    );
  }

  return trimmed;
}
