"use client";

import Link from "next/link";

/**
 * 顶部横幅组件
 * PRD §2.0.2 BANNER-MODEL / BANNER-DB
 */

interface BannerProps {
  type: "warning" | "error" | "info";
  message: string;
  linkText?: string;
  linkHref?: string;
  onDismiss?: () => void;
}

export function Banner({ type, message, linkText, linkHref, onDismiss }: BannerProps) {
  const styles = {
    warning: "border-[#f59e0b] bg-[#fffbeb] text-[#92400e]",
    error: "border-[#e03e3e] bg-[#fef2f2] text-[#e03e3e]",
    info: "border-[#0075de] bg-[#e8f4fd] text-[#1d4ed8]",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm leading-[1.75] flex items-center justify-between gap-2 ${styles[type]}`}>
      <span>{message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {linkText && linkHref && (
          <Link href={linkHref} className="font-semibold underline">
            {linkText}
          </Link>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="underline"
          >
            关闭
          </button>
        )}
      </div>
    </div>
  );
}
