/** 单置顶（互斥）：全局最多一条 pinned */

export function mergePinMetadata(
  metadata: Record<string, unknown>,
  pinned: boolean,
  pinnedAt: string | null,
): Record<string, unknown> {
  return {
    ...metadata,
    pinned,
    pinned_at: pinned ? pinnedAt : null,
  };
}

export interface PinMetadata {
  pinned?: boolean;
  pinned_at?: string;
}

export function applySinglePinToConversationList<
  T extends { id: string; metadata?: PinMetadata },
>(
  conversations: T[],
  targetId: string,
  pinned: boolean,
  pinnedAt: string | null,
): T[] {
  return conversations.map((c) => {
    if (c.id === targetId) {
      return {
        ...c,
        metadata: {
          ...c.metadata,
          pinned,
          pinned_at: pinnedAt ?? undefined,
        },
      };
    }
    if (pinned && c.metadata?.pinned) {
      return {
        ...c,
        metadata: {
          ...c.metadata,
          pinned: false,
          pinned_at: undefined,
        },
      };
    }
    return c;
  });
}

/** PATCH 置顶时写入 metadata（含 pinned_at） */
export function buildPinMetadata(
  metadata: Record<string, unknown>,
  pinned: boolean,
): Record<string, unknown> {
  const pinnedAt = pinned ? new Date().toISOString() : null;
  return mergePinMetadata(metadata, pinned, pinnedAt);
}
