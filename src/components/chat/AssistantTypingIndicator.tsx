"use client";

/** 助手首包到达前的等待态：三点跳动，避免空气泡 + 竖条像卡住 */
export function AssistantTypingIndicator() {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-2xl bg-[#f6f5f4] px-4 py-3.5"
      role="status"
      aria-label="正在思考"
    >
      {[0, 150, 300].map((delayMs) => (
        <span
          key={delayMs}
          className="h-2 w-2 rounded-full bg-[#a39e98] animate-bounce"
          style={{ animationDelay: `${delayMs}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}
