/** 客户端乐观消息 ID，须全局唯一（避免 React key 冲突） */
export function createClientMessageId(role: "user" | "assistant"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${role}-${crypto.randomUUID()}`;
  }
  return `temp-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
