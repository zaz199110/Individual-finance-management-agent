import { getSupabase } from "@/lib/supabase/server";
import type { WorkflowLockKey } from "./eligibility";

/** In-memory fallback when Supabase unavailable (local dev). */
const memoryLocks = new Map<WorkflowLockKey, { conversationId: string; acquiredAt: string }>();

export async function tryAcquireWorkflowLock(
  lockKey: WorkflowLockKey,
  conversationId: string,
): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) {
    for (const [, holder] of memoryLocks) {
      if (holder.conversationId !== conversationId) return false;
    }
    memoryLocks.set(lockKey, {
      conversationId,
      acquiredAt: new Date().toISOString(),
    });
    return true;
  }

  const { data: rows } = await supabase
    .from("workflow_locks")
    .select("lock_key, holder_conversation_id");

  for (const row of rows ?? []) {
    const holder = row.holder_conversation_id as string | null;
    if (holder && holder !== conversationId) {
      return false;
    }
  }

  const { error } = await supabase.from("workflow_locks").upsert({
    lock_key: lockKey,
    holder_conversation_id: conversationId,
    acquired_at: new Date().toISOString(),
  });

  return !error;
}

export async function releaseWorkflowLock(conversationId: string): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) {
    for (const [key, holder] of memoryLocks) {
      if (holder.conversationId === conversationId) {
        memoryLocks.delete(key);
      }
    }
    return;
  }

  await supabase
    .from("workflow_locks")
    .update({ holder_conversation_id: null, acquired_at: null })
    .eq("holder_conversation_id", conversationId);
}

export async function isWorkflowLockHeldByOther(
  conversationId: string,
): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) {
    for (const [, holder] of memoryLocks) {
      if (holder.conversationId !== conversationId) return true;
    }
    return false;
  }

  const { data: rows } = await supabase
    .from("workflow_locks")
    .select("holder_conversation_id");

  return (rows ?? []).some((row) => {
    const holder = row.holder_conversation_id as string | null;
    return Boolean(holder && holder !== conversationId);
  });
}

export async function isAnyWorkflowLockHeld(): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) {
    return memoryLocks.size > 0;
  }

  const { data: rows } = await supabase
    .from("workflow_locks")
    .select("holder_conversation_id");

  return (rows ?? []).some((row) => Boolean(row.holder_conversation_id));
}

export class WorkflowLockError extends Error {
  code = "ERR-WRITE-LOCK";

  constructor(message: string) {
    super(message);
    this.name = "WorkflowLockError";
  }
}
