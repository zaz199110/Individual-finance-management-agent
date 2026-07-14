"use client";

import type { ReportPublishCardBlock } from "./types";

interface ReportPublishCardProps {
  card: ReportPublishCardBlock;
  isLatest?: boolean;
  isViewing?: boolean;
  onPublish?: () => void;
  onDismiss?: () => void;
  onViewDraft?: () => void;
  busy?: boolean;
}

export function ReportPublishCard({
  card,
  isLatest = true,
  isViewing = false,
  onPublish,
  onDismiss,
  onViewDraft,
  busy,
}: ReportPublishCardProps) {
  const superseded = card.status === "active" && !isLatest;
  const disabled = card.status !== "active" || busy;
  const publishDisabled = disabled || superseded;

  function handleCardBodyClick() {
    if (card.status === "active" || card.status === "published") {
      onViewDraft?.();
    }
  }

  function handleViewDraftClick(e: React.MouseEvent) {
    e.stopPropagation();
    onViewDraft?.();
  }

  function handlePublishClick(e: React.MouseEvent) {
    e.stopPropagation();
    onPublish?.();
  }

  function handleDismissClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDismiss?.();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardBodyClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardBodyClick();
        }
      }}
      className={`mt-3 rounded-xl border px-4 py-3 text-left cursor-pointer transition-colors ${
        card.status === "active"
          ? superseded
            ? "border-[rgba(0,0,0,0.08)] bg-[#fafafa] opacity-80"
            : isViewing
              ? "border-[#0075de]/40 bg-[#f0f7ff]"
              : "border-[#16a34a]/30 bg-white hover:border-[#0075de]/30"
          : "border-[rgba(0,0,0,0.08)] bg-[#fafafa] opacity-70 cursor-default"
      }`}
    >
      <div className="font-semibold text-[15px] mb-2 flex flex-wrap items-center gap-2">
        <span>确认发布报告</span>
        {isLatest && card.status === "active" ? (
          <span className="text-xs font-medium text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded-full">
            当前版本
          </span>
        ) : null}
        {superseded ? (
          <span className="text-xs font-medium text-[#615d59] bg-[rgba(0,0,0,0.06)] px-2 py-0.5 rounded-full">
            已有更新版本
          </span>
        ) : null}
        {isViewing && card.status === "active" ? (
          <span className="text-xs font-medium text-[#0075de] bg-[#0075de]/10 px-2 py-0.5 rounded-full">
            正在预览
          </span>
        ) : null}
      </div>
      <p className="text-[14px] text-[#615d59] mb-3 m-0">
        《{card.report_name}》草稿已生成。请核对后确认发布至「我的报告」。
      </p>
      {card.notice_zh ? (
        <p className="text-[13px] text-[#b45309] bg-[#fffbeb] border border-[#fcd34d]/60 rounded-lg px-3 py-2 mb-3 m-0">
          {card.notice_zh}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={publishDisabled}
          onClick={handlePublishClick}
          className="rounded-lg bg-[#16a34a] text-white px-3 py-1.5 text-[14px] font-semibold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          确认发布
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleDismissClick}
          className="rounded-lg bg-white text-[#615d59] px-3 py-1.5 text-[14px] font-semibold border border-[rgba(0,0,0,0.12)] cursor-pointer disabled:opacity-50"
        >
          暂不发布
        </button>
        {card.status === "active" ? (
          <button
            type="button"
            onClick={handleViewDraftClick}
            className="rounded-lg bg-transparent text-[#0075de] px-2 py-1.5 text-[14px] font-semibold border-0 cursor-pointer hover:underline"
          >
            查看报告草稿
          </button>
        ) : null}
      </div>
      {superseded ? (
        <p className="text-xs text-[#615d59] mt-2 mb-0">
          此版本已被更新替代，仅可查看；请在最新卡片上确认发布。
        </p>
      ) : null}
      {card.status === "published" && (
        <p className="text-sm text-[#16a34a] mt-2 mb-0">已发布</p>
      )}
    </div>
  );
}
