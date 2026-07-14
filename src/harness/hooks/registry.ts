import type { HookContext, HookEvent, HookResult } from "./types";

type HookHandler = (ctx: HookContext) => Promise<HookResult | void>;

const handlers: Record<HookEvent, HookHandler[]> = {
  UserPromptSubmit: [],
  PreToolUse: [],
  PostToolUse: [],
  Stop: [],
};

export function registerHook(event: HookEvent, handler: HookHandler): void {
  handlers[event].push(handler);
}

export async function emitHook(
  event: HookEvent,
  ctx: HookContext,
): Promise<HookResult> {
  const merged: HookResult = { reminders: [], blocked: false };
  for (const handler of handlers[event]) {
    const result = await handler(ctx);
    if (!result) continue;
    if (result.reminders?.length) {
      merged.reminders!.push(...result.reminders);
    }
    if (result.blocked) {
      merged.blocked = true;
      merged.blockReason = result.blockReason ?? merged.blockReason;
    }
  }
  return merged;
}
