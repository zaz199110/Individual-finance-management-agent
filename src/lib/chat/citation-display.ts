import type { SceneId } from "@/harness/registry/load";

const CITATION_TITLE_MAX = 56;

/** 自由问答 Tab 不展示引用卡片（简约风格） */
export function shouldShowMessageCitations(activeTab: SceneId): boolean {
  return true;
}

/** 去掉检索 API 返回的冗长标题，便于气泡内展示 */
export function formatCitationTitle(title: string, maxLen = CITATION_TITLE_MAX): string {
  const cleaned = title.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "参考链接";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

export function citationHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 正文末尾由模型重复输出的「参考来源」块，与 metadata citations 去重 */
export function stripTrailingCitationSection(content: string): string {
  const trimmed = content.trimEnd();
  const match = trimmed.match(
    /\n(?:#{1,3}\s*)?(?:\*{1,2})?参考来源(?:\*{1,2})?[：:]?\s*\n[\s\S]*$/u,
  );
  if (!match) return content;
  return trimmed.slice(0, trimmed.length - match[0].length).trimEnd();
}
