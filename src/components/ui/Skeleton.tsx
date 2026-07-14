"use client";

import {
  CHAT_ASSISTANT_MESSAGE_WIDTH,
  CHAT_USER_MESSAGE_WIDTH,
} from "@/components/chat/chat-layout";

/**
 * 骨架屏组件
 * PRD §5.3.16 加载对话时骨架屏 3 条
 */

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

function SkeletonLine({ width = "100%", height = "16px", className = "" }: SkeletonLineProps) {
  return (
    <div
      className={`animate-pulse bg-[#e5e7eb] rounded ${className}`}
      style={{ width, height }}
    />
  );
}

interface SkeletonMessageProps {
  isUser?: boolean;
}

function SkeletonMessage({ isUser = false }: SkeletonMessageProps) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-4 py-3 ${
          isUser ? `${CHAT_USER_MESSAGE_WIDTH} bg-[#0075de]/20` : `${CHAT_ASSISTANT_MESSAGE_WIDTH} bg-[#f6f5f4]`
        }`}
      >
        <SkeletonLine
          width={isUser ? "200px" : "100%"}
          height="14px"
          className="mb-2 max-w-[420px]"
        />
        <SkeletonLine width={isUser ? "150px" : "72%"} height="14px" />
      </div>
    </div>
  );
}

interface MessageSkeletonProps {
  count?: number;
}

/**
 * 消息列表骨架屏
 * 默认显示 3 条骨架消息（PRD §5.3.16）
 */
export function MessageSkeleton({ count = 3 }: MessageSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMessage key={i} isUser={i % 2 === 1} />
      ))}
    </div>
  );
}

interface SidebarSkeletonProps {
  count?: number;
}

/**
 * 侧栏骨架屏
 */
export function SidebarSkeleton({ count = 5 }: SidebarSkeletonProps) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg px-3 py-2">
          <SkeletonLine width={`${60 + Math.random() * 30}%`} height="14px" />
        </div>
      ))}
    </div>
  );
}
