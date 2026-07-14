import type { SceneId } from "@/harness/registry/load";
import { SCENE_LABELS } from "./constants";

/** 跳转卡主按钮文案（须与 HandoffCard 按钮逐字一致） */
export function handoffGoButtonLabel(targetLabel: string): string {
  return `去「${targetLabel}」`;
}

/** 跳转卡标题 */
export const HANDOFF_CARD_TITLE = "接下来您可以：";

/** 跳转卡正文（HandoffCard · 全场景通用） */
export function handoffCardBodyText(targetLabel: string): string {
  return `点击下方「${handoffGoButtonLabel(targetLabel)}」开始正式流程；也可以先在这里聊。`;
}

/** cross_scene_handoff · 助手气泡（profile / plan / portfolio / fund） */
export function handoffCrossSceneAskText(targetScene: SceneId): string {
  const targetLabel = SCENE_LABELS[targetScene];
  return [
    `听起来您想办理 **${targetLabel}** 相关事项。`,
    "",
    `若要正式开始，请点击下方卡片「${handoffGoButtonLabel(targetLabel)}」；也可以继续在这里问我。`,
  ].join("\n");
}

/** CH-10 · 持仓截图识别后 · 表格下方的引导句 */
export function handoffPortfolioScreenshotSuffix(): string {
  const targetLabel = SCENE_LABELS.portfolio;
  return `若要录入或更新这些持仓，请点击下方卡片「${handoffGoButtonLabel(targetLabel)}」；也可以继续在这里聊。`;
}
