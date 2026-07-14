import type { ReactNode } from "react";

interface SettingsRowProps {
  label: string;
  value: ReactNode;
  hint?: string;
  locked?: boolean;
  trailing?: ReactNode;
}

export function SettingsRow({ label, value, hint, locked, trailing }: SettingsRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-[rgba(0,0,0,0.9)]">{label}</span>
          {locked && (
            <span className="inline-flex items-center rounded-full bg-[#f6f5f4] px-2 py-0.5 text-xs font-medium text-[#615d59]">
              暂不可改
            </span>
          )}
        </div>
        {hint && <p className="text-sm text-[#615d59] m-0 leading-relaxed">{hint}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-3 text-right">
        <span className="text-[15px] text-[rgba(0,0,0,0.85)]">{value}</span>
        {trailing}
      </div>
    </div>
  );
}
