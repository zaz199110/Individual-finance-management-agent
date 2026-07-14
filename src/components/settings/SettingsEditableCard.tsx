"use client";

import type { ReactNode } from "react";

interface SettingsEditableCardProps {
  title: ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDone: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  editable?: boolean;
  headerExtra?: ReactNode;
  viewContent: ReactNode;
  editContent: ReactNode;
  footer?: ReactNode;
}

export function SettingsEditableCard({
  title,
  editing,
  onEdit,
  onCancel,
  onDone,
  doneLabel = "完成",
  doneDisabled = false,
  editable = true,
  headerExtra,
  viewContent,
  editContent,
  footer,
}: SettingsEditableCardProps) {
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.1)] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="font-semibold text-[16px]">{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          {editable &&
            (editing ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={doneDisabled}
                className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-sm font-semibold border-0 cursor-pointer disabled:opacity-50"
              >
                {doneLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
            >
              编辑
            </button>
          ))}
        </div>
      </div>

      {editing ? editContent : viewContent}
      {footer}
    </section>
  );
}
