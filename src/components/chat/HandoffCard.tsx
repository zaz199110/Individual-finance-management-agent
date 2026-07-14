"use client";

import type { SceneId } from "@/harness/registry/load";
import {
  HANDOFF_CARD_TITLE,
  handoffCardBodyText,
  handoffGoButtonLabel,
} from "@/lib/handoff/copy";
import type { HandoffBlock } from "./types";

interface HandoffCardProps {
  card: HandoffBlock;
  disabled?: boolean;
  onGo: () => void;
  onDismiss: () => void;
}

export function HandoffCard({
  card,
  disabled,
  onGo,
  onDismiss,
}: HandoffCardProps) {
  const inactive =
    disabled || card.status !== "pending";

  return (
    <div
      className={`mt-3 rounded-xl border p-4 space-y-3 ${
        inactive
          ? "border-[rgba(0,0,0,0.06)] bg-[#fafafa] opacity-70"
          : "border-[#0075de33] bg-white"
      }`}
    >
      <div className="text-sm font-semibold text-[#615d59]">
        {HANDOFF_CARD_TITLE}
      </div>
      <p className="text-sm text-[#615d59] leading-[1.75]">
        {handoffCardBodyText(card.target_label)}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={inactive}
          onClick={onGo}
          className="rounded-lg bg-[#0075de] text-white px-4 py-2 text-[15px] font-semibold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {handoffGoButtonLabel(card.target_label)}
        </button>
        <button
          type="button"
          disabled={inactive}
          onClick={onDismiss}
          className="rounded-lg border border-[rgba(0,0,0,0.1)] px-4 py-2 text-[15px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-white"
        >
          先在这里聊
        </button>
      </div>
      {inactive && card.status !== "pending" && (
        <div className="text-xs text-[#615d59]">
          {card.status === "accepted"
            ? "已打开对应功能"
            : card.status === "dismissed"
              ? "已选择继续当前对话"
              : "已过时（您继续发了新消息）"}
        </div>
      )}
    </div>
  );
}

export function sceneLabel(scene: SceneId): string {
  const labels: Record<SceneId, string> = {
    chat: "自由问答",
    profile: "需求梳理",
    plan: "资产配置",
    portfolio: "持仓分析",
    fund: "基金解析",
  };
  return labels[scene];
}
