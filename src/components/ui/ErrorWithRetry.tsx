"use client";

/**
 * 错误提示 + 重试按钮组件
 * PRD §5.3.16 ERR-LOAD-MSGS / ERR-LOAD-HISTORY
 */

interface ErrorWithRetryProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorWithRetry({ message, onRetry, className = "" }: ErrorWithRetryProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
      <div className="text-[#e03e3e] text-sm mb-3">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-[rgba(0,0,0,0.1)] px-4 py-2 text-sm font-semibold bg-white cursor-pointer hover:bg-[#f6f5f4]"
        >
          重试
        </button>
      )}
    </div>
  );
}
