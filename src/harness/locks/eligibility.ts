import type { SceneId } from "@/harness/registry/load";
import type { ExecutionPlan } from "@/harness/types";

export type WorkflowLockKey = "profile" | "plan" | "portfolio";

export function isWriteWorkflowScene(scene: SceneId): scene is WorkflowLockKey {
  return scene === "profile" || scene === "plan" || scene === "portfolio";
}

/** SH-08: profile/plan/portfolio 写流程 stream 才加锁 */
export function needsWorkflowLock(
  scene: SceneId,
  plan: ExecutionPlan,
  trigger?: string,
): boolean {
  if (!isWriteWorkflowScene(scene)) return false;
  if (trigger === "handoff_autostart") return true;
  return plan.intent === "scene_task";
}

export function sceneToLockKey(scene: WorkflowLockKey): WorkflowLockKey {
  return scene;
}

export const SH08_MESSAGE =
  "需求梳理、资产配置或持仓的分析正在进行中，请等当前流程结束后再试。";

export const SH08_CODE = "ERR-WRITE-LOCK";
