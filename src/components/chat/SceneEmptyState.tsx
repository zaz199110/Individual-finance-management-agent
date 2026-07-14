"use client";

import type { SceneId } from "@/harness/registry/load";
import { SCENE_TABS } from "./types";

interface SceneEmptyStateProps {
  activeTab: SceneId;
  sceneTitle?: string;
  sceneBody?: string;
}

const CHAT_EMPTY = {
  title: "理财助手",
  body: "有问题尽管问，需要出方案、看持仓或解读基金，切换到下方对应场景即可。",
};

const SCENE_EMPTY: Partial<Record<SceneId, { title: string; body: string }>> = {
  profile: {
    title: "梳理你的投资需求",
    body: "从基本情况或理财目标聊起，我会帮您整理成报告。",
  },
  plan: {
    title: "生成资产配置方案",
    body: "请先完成投资需求的整理",
  },
  portfolio: {
    title: "录入持仓",
    body: "直接打字，或点左下角 + 上传持仓截图。",
  },
  fund: {
    title: "基金深度解读",
    body: "输入代码或名称，直接提问即可。",
  },
};

export function SceneEmptyState({
  activeTab,
  sceneTitle,
  sceneBody,
}: SceneEmptyStateProps) {
  if (activeTab === "chat") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
        <div className="text-2xl font-semibold mb-3">{CHAT_EMPTY.title}</div>
        <p className="text-[#615d59] max-w-md leading-[1.75]">{CHAT_EMPTY.body}</p>
      </div>
    );
  }

  const fallback = SCENE_EMPTY[activeTab];
  const title =
    sceneTitle ??
    fallback?.title ??
    SCENE_TABS.find((t) => t.id === activeTab)?.label ??
    "";
  const body =
    sceneBody ?? fallback?.body ?? "该功能还在完善中，您也可以先在「自由问答」里提问。";

  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
      <div className="text-2xl font-semibold mb-3">{title}</div>
      <p className="text-[#615d59] max-w-md whitespace-pre-wrap leading-[1.75]">{body}</p>
    </div>
  );
}
