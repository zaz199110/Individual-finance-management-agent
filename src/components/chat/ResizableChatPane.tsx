"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_PANE_DEFAULT_WIDTH,
  clampChatPaneWidth,
  readChatPaneWidth,
  writeChatPaneWidth,
} from "@/components/chat/chat-pane-width";

interface ResizableChatPaneProps {
  children: React.ReactNode;
  className?: string;
  /** 模式 B 为 true 时固定宽并可拖拽左缘分屏线 */
  resizable?: boolean;
}

export function ResizableChatPane({
  children,
  className = "",
  resizable = false,
}: ResizableChatPaneProps) {
  const [width, setWidth] = useState(CHAT_PANE_DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (resizable) setWidth(readChatPaneWidth());
  }, [resizable]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = clampChatPaneWidth(dragRef.current.startWidth + delta);
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    setWidth((w) => {
      writeChatPaneWidth(w);
      return w;
    });
  }, [onMouseMove]);

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!resizable) {
    return <div className={className}>{children}</div>;
  }

  return (
    <aside
      style={{ width }}
      className={`relative shrink-0 flex flex-col min-h-0 overflow-hidden ${className}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整聊天列宽度"
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#0075de]/20 z-10"
      />
      {children}
    </aside>
  );
}
