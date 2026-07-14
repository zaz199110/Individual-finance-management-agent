import { listCommands } from "@/harness/registry/load";
import type { SceneId } from "@/harness/registry/load";

export function buildToolsBlock(scene: SceneId): string {
  const commands = listCommands({ scene, slashOnly: true });
  if (!commands.length) return "可用 Command：（无）";
  const lines = commands.map(
    (c) => `- ${c.id}（${c.type_label_zh}）：${c.description_zh}`,
  );
  return [
    "可用 Command（Planner 按需调用，用户可用 / 唤起）：",
    ...lines,
    "",
    "⚠️ 重要：不要输出 <toolcall>、<function=xxx>、<tool_call> 等格式的工具调用。所有工具由系统自动调用，你只需输出文本回复。",
  ].join("\n");
}
