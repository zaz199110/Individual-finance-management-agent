/**
 * CH-FIRST-01：首屏 / 无效 ?c= 时定位默认对话；仅无历史时才 POST 新建。
 * 优先级：置顶（全局最多一条）→ 最近更新 → POST 新建。
 * 模块级 in-flight 锁避免 React Strict Mode 或并发 effect 重复 POST。
 */

export type ConversationEntryFetch = typeof fetch;

let inFlightResolve: Promise<string | null> | null = null;
let inFlightCreate: Promise<string | null> | null = null;
/** 同标签页内 CH-FIRST-01 解析结果，避免 Strict Mode 重挂载重复 POST */
let sessionResolvedId: string | null = null;

const SESSION_RESOLVED_KEY = "agent-demo.last-resolved-c";

function readSessionResolvedId(): string | null {
  if (sessionResolvedId) return sessionResolvedId;
  if (typeof globalThis.sessionStorage === "undefined") return null;
  try {
    const raw = globalThis.sessionStorage.getItem(SESSION_RESOLVED_KEY);
    sessionResolvedId = raw || null;
    return sessionResolvedId;
  } catch {
    return null;
  }
}

function writeSessionResolvedId(id: string): void {
  sessionResolvedId = id;
  if (typeof globalThis.sessionStorage === "undefined") return;
  try {
    globalThis.sessionStorage.setItem(SESSION_RESOLVED_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearSessionResolvedConversation(): void {
  sessionResolvedId = null;
  if (typeof globalThis.sessionStorage === "undefined") return;
  try {
    globalThis.sessionStorage.removeItem(SESSION_RESOLVED_KEY);
  } catch {
    /* ignore */
  }
}

async function parseConversationId(
  res: Response,
): Promise<string | null> {
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id?: string;
    conversations?: Array<{ id?: string }>;
  };
  return data.id ?? data.conversations?.[0]?.id ?? null;
}

/** 定位最近一条历史；无历史时才 POST 新建（CH-FIRST-01） */
export async function resolveConversationEntry(
  fetchFn: ConversationEntryFetch = fetch,
): Promise<string | null> {
  const cached = readSessionResolvedId();
  if (cached) return cached;
  if (inFlightResolve) return inFlightResolve;

  inFlightResolve = (async () => {
    try {
      const listRes = await fetchFn("/api/conversations?limit=1");
      const existingId = await parseConversationId(listRes);
      if (existingId) {
        writeSessionResolvedId(existingId);
        return existingId;
      }

      const postRes = await fetchFn("/api/conversations", { method: "POST" });
      const newId = await parseConversationId(postRes);
      if (newId) writeSessionResolvedId(newId);
      return newId;
    } catch {
      return null;
    } finally {
      inFlightResolve = null;
    }
  })();

  return inFlightResolve;
}

/** 用户主动「+ 新对话」：始终 POST；in-flight 锁防连点重复创建 */
export async function createConversationEntry(
  fetchFn: ConversationEntryFetch = fetch,
  init?: RequestInit,
): Promise<string | null> {
  if (inFlightCreate) return inFlightCreate;

  inFlightCreate = (async () => {
    try {
      const postRes = await fetchFn("/api/conversations", {
        method: "POST",
        ...init,
      });
      const id = await parseConversationId(postRes);
      if (id) writeSessionResolvedId(id);
      return id;
    } catch {
      return null;
    } finally {
      inFlightCreate = null;
    }
  })();

  return inFlightCreate;
}

/** 测试专用：重置模块级 in-flight 状态 */
export function resetConversationEntryLocks(): void {
  inFlightResolve = null;
  inFlightCreate = null;
  sessionResolvedId = null;
  clearSessionResolvedConversation();
}
