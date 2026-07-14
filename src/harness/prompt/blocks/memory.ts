import { getUserMemory } from "@/lib/settings/user-memory";

/** s09 — read user_memory from DB (Harness never reads disk directly). */
export async function buildMemoryBlock(): Promise<string | null> {
  const memory = await getUserMemory();
  const content = memory.content_md?.trim();
  if (!content) return null;
  return `用户偏好记忆（只读）：\n${content}`;
}
