import type { SceneId } from "@/harness/registry/load";

/** CH-TAB-01: locked conversation · send in a different scene tab */
export type LockedTabSwitchDecision = "create" | "confirm_then_maybe_create";

/** 未锁定或尚无消息 → 留在当前对话；已锁定且有消息且目标场景≠当前类型 → 发送前 CH-TAB-01 */
export function shouldUseLockedTabSwitch(args: {
  typeLocked: boolean;
  messageCount: number;
  currentType: SceneId;
  targetTab: SceneId;
}): boolean {
  const { typeLocked, messageCount, currentType, targetTab } = args;
  if (targetTab === currentType) return false;
  if (!typeLocked || messageCount === 0) return false;
  return true;
}

/** 已锁定对话切到其他场景 Tab 时，主区预览空态（不新建侧栏条目） */
export function isPreviewingOtherScene(args: {
  typeLocked: boolean;
  conversationType: SceneId;
  activeTab: SceneId;
  messageCount: number;
}): boolean {
  const { typeLocked, conversationType, activeTab, messageCount } = args;
  if (!typeLocked || messageCount === 0) return false;
  return activeTab !== conversationType;
}

export function decideLockedTabSwitch(
  hasExistingOfType: boolean,
): LockedTabSwitchDecision {
  return hasExistingOfType ? "confirm_then_maybe_create" : "create";
}

export function lockedTabCreateConfirmMessage(sceneLabel: string): string {
  return `已有${sceneLabel}对话，要新建吗？取消后可从侧栏选择已有对话。`;
}
