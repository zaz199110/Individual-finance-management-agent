import type { SceneId } from "@/harness/registry/load";

export const SCENE_LABELS: Record<SceneId, string> = {
  chat: "自由问答",
  profile: "需求梳理",
  plan: "资产配置",
  portfolio: "持仓分析",
  fund: "基金解析",
};

export const HANDOFF_DISMISS_REPLY =
  "好的，我们继续在这里聊。如果我理解有误，您直接说就好；需要跳转时再点卡片或告诉我即可。";
