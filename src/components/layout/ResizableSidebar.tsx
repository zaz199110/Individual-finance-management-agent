"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampSidebarWidth,
  readSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  writeSidebarWidth,
} from "@/components/layout/sidebar-width";

interface ResizableSidebarProps {
  children: React.ReactNode;
  className?: string;
}

export function ResizableSidebar({ children, className = "" }: ResizableSidebarProps) {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setWidth(readSidebarWidth());
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    const next = clampSidebarWidth(dragRef.current.startWidth + delta);
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
      writeSidebarWidth(w);
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

  return (
    <aside
      style={{ width }}
      className={`relative shrink-0 border-r border-[rgba(0,0,0,0.1)] flex flex-col h-screen overflow-hidden ${className}`}
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度"
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#0075de]/20 z-10"
      />
    </aside>
  );
}
