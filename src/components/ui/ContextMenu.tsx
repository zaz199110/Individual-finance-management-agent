"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nextX = x;
    let nextY = y;
    if (nextX + rect.width > window.innerWidth - pad) {
      nextX = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (nextY + rect.height > window.innerHeight - pad) {
      nextY = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPosition({ x: nextX, y: nextY });
  }, [x, y, items]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100] min-w-[140px] rounded-lg border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-lg"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`block w-full text-left px-3 py-2 text-sm border-0 bg-transparent cursor-pointer ${
            item.danger
              ? "text-[#e03e3e] hover:bg-[#fef2f2]"
              : "text-[rgba(0,0,0,0.9)] hover:bg-[#f6f5f4]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
